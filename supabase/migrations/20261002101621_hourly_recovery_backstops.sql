-- Slow two non-core safety-net clocks to once per hour while preserving them.
-- AI reasoning recovery runs at minute 30 during the active planning window.
-- Routine surface cleanup retry runs at minute 30 during its existing candidate windows.

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='meplus-ai-reasoning-worker-retry'),
  schedule := '30 5-19 * * *'
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='meplus-routine-surface-cutoff-retry'),
  schedule := '30 10-11,16-17,22-23 * * *'
);

update private.scheduler_runtime_registry
set source_note='AI child worker is work-driven; recovery cron runs once per hour at minute 30 during the 06:00-21:59 Europe/Berlin planning window.',
    updated_at=clock_timestamp()
where scheduler_key='ai_reasoning_worker';

update private.scheduler_runtime_registry
set source_note='Removal-only retry backstop. Once per hour at minute 30 during CET/CEST cutoff candidate UTC hours, wake only an already-pending/retry routine_surface_cutoff_cleanup dispatch whose external_available_at has elapsed. No planning, creation, rescheduling, completion inference or Catalog reconciliation.',
    updated_at=clock_timestamp()
where scheduler_key='routine_surface_cutoff_retry';


-- Keep DST edge supplements aligned with the hourly recovery cadence,
-- and remove expired same-day edge jobs instead of leaving them active.

create or replace function private.meplus_ensure_edge_cron_day(p_user_id uuid, p_day date)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_preview jsonb;
  v_hour int;
  v_day int := extract(day from p_day)::int;
  v_month int := extract(month from p_day)::int;
  v_suffix text := to_char(p_day,'YYYYMMDD');
  v_job_name text;
  v_schedule text;
  v_command text;
  v_job_id bigint;
  v_runtime text;
  v_count int := 0;
begin
  v_preview := private.meplus_edge_cron_preview(p_day);
  v_hour := nullif(v_preview->>'supplement_utc_hour','')::int;

  if v_hour is null then
    return jsonb_build_object('local_day',p_day,'supplement_required',false,'jobs',0);
  end if;

  foreach v_runtime in array array['hourly','watchdog','ai','todoist']
  loop
    v_job_name := 'meedge-' || v_runtime || '-' || v_suffix;
    v_schedule := case v_runtime
      when 'hourly' then format('0 %s %s %s *',v_hour,v_day,v_month)
      when 'watchdog' then format('15 %s %s %s *',v_hour,v_day,v_month)
      when 'ai' then format('30 %s %s %s *',v_hour,v_day,v_month)
      when 'todoist' then format('*/5 %s %s %s *',v_hour,v_day,v_month)
    end;

    v_command := case v_runtime
      when 'hourly' then format(
        $c$select case when (clock_timestamp() at time zone 'Europe/Berlin')::date=date '%s'
          and private.meplus_planning_window_active(clock_timestamp())
          then private.run_meplus_hourly_backend_scheduler('%s'::uuid,clock_timestamp())
          else jsonb_build_object('status','date_guard_noop') end;$c$,
        p_day,p_user_id)
      when 'watchdog' then format(
        $c$select case when (clock_timestamp() at time zone 'Europe/Berlin')::date=date '%s'
          and private.meplus_planning_window_active(clock_timestamp())
          then private.run_meplus_scheduler_watchdog('%s'::uuid,clock_timestamp())
          else jsonb_build_object('status','date_guard_noop') end;$c$,
        p_day,p_user_id)
      when 'ai' then format(
        $c$select case when (clock_timestamp() at time zone 'Europe/Berlin')::date=date '%s'
          and private.meplus_planning_window_active(clock_timestamp())
          then private.wake_meplus_reasoning_worker() else null::bigint end;$c$,
        p_day)
      when 'todoist' then format(
        $c$select case when (clock_timestamp() at time zone 'Europe/Berlin')::date=date '%s'
          and private.meplus_planning_window_active(clock_timestamp())
          then private.wake_meplus_todoist_dispatcher() else null::bigint end;$c$,
        p_day)
    end;

    select j.jobid into v_job_id
    from cron.job j
    where j.jobname=v_job_name
    limit 1;

    if v_job_id is null then
      v_job_id := cron.schedule(v_job_name,v_schedule,v_command);
    else
      perform cron.alter_job(v_job_id,v_schedule,v_command,null,null,true);
    end if;

    insert into private.meplus_edge_cron_plan(
      user_id,local_day,runtime_key,job_name,job_id,schedule,utc_hour
    ) values (
      p_user_id,p_day,v_runtime,v_job_name,v_job_id,v_schedule,v_hour
    )
    on conflict(user_id,local_day,runtime_key)
    do update set
      job_name=excluded.job_name,
      job_id=excluded.job_id,
      schedule=excluded.schedule,
      utc_hour=excluded.utc_hour,
      created_at=clock_timestamp();

    v_count := v_count+1;
  end loop;

  return jsonb_build_object(
    'local_day',p_day,
    'supplement_required',true,
    'utc_hour',v_hour,
    'jobs',v_count
  );
end;
$function$;

create or replace function private.run_meplus_local_edge_cron_planner(
  p_user_id uuid,
  p_now timestamp with time zone default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_day date := (p_now at time zone 'Europe/Berlin')::date;
  v_rec record;
  v_tomorrow jsonb;
begin
  perform public.record_scheduler_heartbeat(
    p_user_id,'scheduler_local_edge_planner','invoked',null,null,1440,60,null,
    'supabase:pg_cron:meplus-local-edge-cron-planner'
  );

  for v_rec in
    select job_id
    from private.meplus_edge_cron_plan
    where user_id=p_user_id and local_day <= v_day
  loop
    begin
      perform cron.unschedule(v_rec.job_id);
    exception when others then
      null;
    end;
  end loop;

  delete from private.meplus_edge_cron_plan
  where user_id=p_user_id and local_day <= v_day;

  v_tomorrow := private.meplus_ensure_edge_cron_day(p_user_id,v_day+1);

  perform public.record_scheduler_heartbeat(
    p_user_id,'scheduler_local_edge_planner','completed','1.32-draft',null,1440,60,null,
    'supabase:pg_cron:meplus-local-edge-cron-planner'
  );

  return jsonb_build_object(
    'status','completed',
    'cleaned_through',v_day,
    'tomorrow',v_tomorrow
  );
exception when others then
  perform public.record_scheduler_heartbeat(
    p_user_id,'scheduler_local_edge_planner','failed','1.32-draft',
    jsonb_build_object('error_type','local_edge_cron_planner_failure','message',sqlerrm),
    1440,60,null,'supabase:pg_cron:meplus-local-edge-cron-planner'
  );
  raise;
end;
$function$;

update private.scheduler_runtime_registry
set source_note='Daily safe-hour planner that removes expired same-day edge cron rows and pre-creates only the next day DST-dependent edge-hour supplements for exact 06:00-21:59 Europe/Berlin coverage.',
    updated_at=clock_timestamp()
where scheduler_key='scheduler_local_edge_planner';
