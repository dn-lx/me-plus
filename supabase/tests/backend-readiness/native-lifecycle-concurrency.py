"""Real PostgreSQL sessions; strictly restricted to the disposable CI database."""
import os
import subprocess
import time

assert os.environ.get('PGHOST') == '127.0.0.1'
assert os.environ.get('PGDATABASE') == 'meplus_backend_test'

def sql(query, env=None):
    return subprocess.check_output(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', query], text=True, env=env).strip()

for status in ('completed', 'partial', 'skipped'):
    owner = sql("SELECT gen_random_uuid()")
    sql(f"""
      INSERT INTO auth.users(id,raw_user_meta_data) VALUES('{owner}','{{"timezone":"Europe/Berlin"}}');
      SELECT set_config('request.jwt.claim.sub','{owner}',false);
      SELECT public.save_meplus_routine('{{"request_id":"{sql('SELECT gen_random_uuid()')}","title":"Concurrency fixture","domain":"personal","normal_duration_minutes":20,"schedule":{{"type":"daily","timezone":"Europe/Berlin","window_start":"06:00","window_end":"22:00"}}}}'::jsonb);
      SELECT private.meplus_materialize_native_day('{owner}','2026-10-16T08:00:00Z');
    """)
    action = sql(f"SELECT id FROM public.actions WHERE user_id='{owner}'")
    app = f'meplus_lifecycle_{status}'
    env = dict(os.environ, PGAPPNAME=app)
    writer = subprocess.Popen(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', f"""
      BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub','{owner}',true);
      SELECT public.record_meplus_action_decision('{action}','{status}');
      SELECT pg_sleep(3); COMMIT;
    """], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        deadline = time.monotonic() + 8
        while sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{app}' AND wait_event='PgSleep'") != '1':
            if writer.poll() is not None or time.monotonic() > deadline:
                raise AssertionError('writer did not reach locked decision barrier: ' + str(writer.communicate()))
            time.sleep(0.05)
        sql(f"SET statement_timeout='8s'; SELECT private.meplus_reconcile_native_occurrences('{owner}','2026-10-18T08:00:00Z')")
        out, err = writer.communicate(timeout=10)
        assert writer.returncode == 0, err
        assert sql(f"SELECT status FROM public.actions WHERE id='{action}'") == status
        assert sql(f"SELECT status FROM public.routine_events WHERE id=(SELECT routine_event_id FROM public.actions WHERE id='{action}')") == status
        assert sql(f"SELECT count(*) FROM public.action_events WHERE action_id='{action}' AND event_type='expired'") == '0'
        print(f'PASS concurrent cleanup preserves {status}')
    finally:
        if writer.poll() is None:
            writer.kill()
            writer.communicate()
