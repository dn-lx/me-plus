do $migration$
declare
  v_def text;
  v_old text := $old$        if v_cron_status is null then
          v_failures := v_failures || jsonb_build_array(jsonb_build_object(
            'error_type','scheduler_runtime_cron_never_recorded',
            'scheduler_key',v_runtime.scheduler_key,
            'cron_jobname',v_runtime.cron_jobname
          ));
        elsif v_cron_status not in ('succeeded','running','starting','connecting','sending') then$old$;
  v_new text := $new$        if v_cron_status is null then
          -- No cron history is not independently a failure. Newly registered
          -- daily/cadence runtimes can be healthy before their first scheduled
          -- tick. Canonical lateness/never-recorded semantics are owned by
          -- scheduler_runtime_health_one above.
          null;
        elsif v_cron_status not in ('succeeded','running','starting','connecting','sending') then$new$;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='run_meplus_scheduler_watchdog'
    and pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_now timestamp with time zone';

  if v_def is null then
    raise exception 'run_meplus_scheduler_watchdog not found';
  end if;

  if strpos(v_def,v_old)=0 then
    raise exception 'watchdog cron-history patch anchor not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$migration$;
