begin;

select set_config(
  'app.sch042_test_user',
  (select id::text
   from public.profiles
   where exists (
     select 1
     from public.data_sources ds
     where ds.user_id=profiles.id
       and ds.provider='google-drive-healthsync'
       and ds.display_name='Health Sync · Google Drive'
       and ds.status='active'
   )
   order by created_at
   limit 1),
  true
);

set local role service_role;

do $test$
declare
  u uuid := current_setting('app.sch042_test_user')::uuid;
  b jsonb;
  f jsonb;
begin
  if u is null then raise exception 'SCH-042 HealthSync test user fixture missing'; end if;

  b := public.server_begin_healthsync_run(
    u,'__sch042_sql_acceptance__',jsonb_build_object('acceptance',true)
  );
  if b->>'status' <> 'started' then
    raise exception 'SCH-042 begin failed: %',b;
  end if;

  f := public.server_finish_healthsync_run(
    u,(b->>'syncRunId')::uuid,'completed',null,null,
    jsonb_build_object('acceptance',true)
  );
  if f->>'status' <> 'completed' then
    raise exception 'SCH-042 finish failed: %',f;
  end if;
end
$test$;

reset role;

do $verify$
declare
  u uuid := current_setting('app.sch042_test_user')::uuid;
  h public.scheduler_heartbeats%rowtype;
  health jsonb;
begin
  select * into h
  from public.scheduler_heartbeats
  where user_id=u and scheduler_key='healthsync_drive_ingestion';

  if h.last_invoked_at is null or h.last_succeeded_at is null
     or h.last_status <> 'completed' then
    raise exception 'SCH-042 heartbeat lifecycle invalid';
  end if;

  health := private.scheduler_runtime_health_one(
    u,'healthsync_drive_ingestion',clock_timestamp()
  );

  if health->>'health_status' <> 'healthy'
     or (health->>'heartbeat_required')::boolean is not true then
    raise exception 'SCH-042 runtime health invalid: %',health;
  end if;
end
$verify$;

rollback;

select 'PASS: SCH-042 HealthSync invocation/completion heartbeat and runtime health acceptance' as result;
