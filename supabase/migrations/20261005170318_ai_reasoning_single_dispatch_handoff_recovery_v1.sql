create or replace function public.reschedule_ai_scheduler_dispatch(
  p_dispatch_id uuid,
  p_error jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
  v_next_status text;
  v_available_at timestamptz;
  v_code text := coalesce(p_error->>'code','');
  v_error_type text := coalesce(p_error->>'error_type','');
begin
  select * into v_dispatch
  from public.scheduler_dispatches
  where id = p_dispatch_id
  for update;

  if not found then
    raise exception 'scheduler dispatch not found';
  end if;

  if v_dispatch.status <> 'claimed' then
    return jsonb_build_object('status',v_dispatch.status,'dispatch_id',v_dispatch.id,'ignored',true);
  end if;

  if v_code in ('credit_balance_exhausted','invalid_api_key','insufficient_quota')
     or v_error_type in ('openai_credentials_missing','openai_billing_blocked') then
    v_next_status := 'blocked';
    v_available_at := v_dispatch.available_at;
  elsif v_dispatch.attempts >= 3 then
    v_next_status := 'failed';
    v_available_at := v_dispatch.available_at;
  elsif v_error_type = 'edge_worker_wall_clock_timeout' then
    v_next_status := 'pending';
    v_available_at := clock_timestamp();
  else
    v_next_status := 'pending';
    v_available_at := clock_timestamp() + make_interval(mins => greatest(2, least(15, v_dispatch.attempts * 3)));
  end if;

  update public.scheduler_dispatches
  set status = v_next_status,
      available_at = v_available_at,
      claimed_at = null,
      completed_at = case when v_next_status='failed' then clock_timestamp() else null end,
      last_error = coalesce(p_error,'{}'::jsonb),
      updated_at = clock_timestamp()
  where id = v_dispatch.id;

  perform public.record_scheduler_heartbeat(
    v_dispatch.user_id,
    'ai_reasoning_worker',
    'failed',
    coalesce(v_dispatch.payload->>'policy_version','1.14-draft'),
    coalesce(p_error,'{}'::jsonb),
    5,
    10,
    null,
    'supabase:edge:me-plus-reasoning-worker'
  );

  if v_dispatch.scheduler_key='guidance_scheduler'
     and coalesce((v_dispatch.payload->>'guidance_only')::boolean,false)
     and v_next_status in ('failed','blocked') then
    if v_dispatch.scheduler_run_id is not null then
      perform public.finish_scheduler_run(
        v_dispatch.user_id,
        v_dispatch.scheduler_run_id,
        'failed',
        jsonb_build_array('ai_reasoning_worker'),
        jsonb_build_object('dispatch_id',v_dispatch.id,'guidance_only',true),
        coalesce(p_error,'{}'::jsonb)
      );
    end if;

    perform public.record_scheduler_heartbeat(
      v_dispatch.user_id,
      'guidance_scheduler',
      'failed',
      coalesce(v_dispatch.payload->>'policy_version','1.41-draft'),
      coalesce(p_error,'{}'::jsonb),
      120,
      15,
      null,
      'supabase:pg_cron:meplus-guidance-scheduler'
    );
  end if;

  return jsonb_build_object(
    'dispatch_id',v_dispatch.id,
    'status',v_next_status,
    'attempts',v_dispatch.attempts,
    'available_at',v_available_at,
    'retryable',v_next_status='pending'
  );
end;
$function$;

revoke all on function public.reschedule_ai_scheduler_dispatch(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reschedule_ai_scheduler_dispatch(uuid,jsonb) to service_role;

create or replace function private.wake_reasoning_on_ready_dispatch()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_should_wake boolean := false;
begin
  if not private.meplus_runtime_window_active(v_now) then
    return new;
  end if;

  if new.dispatch_kind <> 'reasoning_and_execution_surface'
     or not private.scheduler_dispatch_requires_ai(new.reasons,new.payload) then
    return new;
  end if;

  if new.status='pending'
     and coalesce(new.available_at,v_now) <= v_now then
    if tg_op='INSERT' then
      v_should_wake := true;
    else
      v_should_wake :=
        old.status is distinct from new.status
        or old.available_at is distinct from new.available_at;
    end if;
  elsif tg_op='UPDATE'
        and old.status is distinct from new.status
        and new.status in ('completed','failed','blocked') then
    select exists(
      select 1
      from public.scheduler_dispatches d
      where d.user_id=new.user_id
        and d.id<>new.id
        and d.dispatch_kind='reasoning_and_execution_surface'
        and d.status='pending'
        and d.available_at<=v_now
        and d.attempts<3
        and private.scheduler_dispatch_requires_ai(d.reasons,d.payload)
    ) into v_should_wake;
  end if;

  if v_should_wake then
    begin
      perform private.wake_meplus_reasoning_worker();
    exception when others then
      perform public.record_scheduler_signal(
        new.user_id,
        'ai_reasoning_event_wake_failed',
        'scheduler_dispatches',
        new.id,
        jsonb_build_object(
          'dispatch_id',new.id,
          'error_type','ai_reasoning_event_wake_failed',
          'message',sqlerrm
        ),
        'ai_reasoning_event_wake_failed:' || new.id::text
      );
    end;
  end if;

  return new;
end;
$function$;

revoke all on function private.wake_reasoning_on_ready_dispatch() from public, anon, authenticated, service_role;

drop trigger if exists scheduler_wake_reasoning_on_ready_dispatch on public.scheduler_dispatches;
create trigger scheduler_wake_reasoning_on_ready_dispatch
after insert or update on public.scheduler_dispatches
for each row execute function private.wake_reasoning_on_ready_dispatch();

do $$
begin
  if exists(select 1 from cron.job where jobname='meplus-ai-reasoning-retry-backstop') then
    perform cron.unschedule('meplus-ai-reasoning-retry-backstop');
  end if;
end;
$$;

select cron.schedule(
  'meplus-ai-reasoning-retry-backstop',
  '*/5 5-21 * * *',
  $cron$select case when private.meplus_runtime_window_active(clock_timestamp())
    then private.wake_meplus_reasoning_worker()
    else null::bigint end;$cron$
);

insert into private.scheduler_runtime_registry(
  user_id,scheduler_key,runtime_kind,runtime_ref,cron_jobname,
  dispatch_phase,parent_scheduler_key,enabled_expected,heartbeat_required,
  expected_cadence_minutes,allowed_lateness_minutes,source_note,
  health_mode,active_timezone,active_start_local,active_end_local,
  schedule_anchor_local,daily_local_time,updated_at
)
values(
  '459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid,
  'ai_reasoning_retry_backstop',
  'pg_cron',
  'supabase:pg_cron:meplus-ai-reasoning-retry-backstop',
  'meplus-ai-reasoning-retry-backstop',
  null,
  'ai_reasoning_worker',
  true,
  false,
  null,
  10,
  'Five-minute safe-core daytime reliability backstop for due AI retries. Event-driven dispatch wakes remain primary. The backstop only calls the bounded reasoning wake function and is a no-op when no due AI dispatch exists.',
  'unmetered',
  'Europe/Berlin',
  null,
  null,
  null,
  null,
  clock_timestamp()
)
on conflict(user_id,scheduler_key) do update set
  runtime_kind=excluded.runtime_kind,
  runtime_ref=excluded.runtime_ref,
  cron_jobname=excluded.cron_jobname,
  parent_scheduler_key=excluded.parent_scheduler_key,
  enabled_expected=excluded.enabled_expected,
  heartbeat_required=excluded.heartbeat_required,
  expected_cadence_minutes=excluded.expected_cadence_minutes,
  allowed_lateness_minutes=excluded.allowed_lateness_minutes,
  source_note=excluded.source_note,
  health_mode=excluded.health_mode,
  active_timezone=excluded.active_timezone,
  active_start_local=excluded.active_start_local,
  active_end_local=excluded.active_end_local,
  schedule_anchor_local=excluded.schedule_anchor_local,
  daily_local_time=excluded.daily_local_time,
  updated_at=clock_timestamp();

update private.scheduler_runtime_registry
set source_note='AI child worker is work-driven during 06:00-23:59 Europe/Berlin. One model dispatch is processed per Edge invocation. Event-driven handoff is primary; a registered five-minute safe-core retry backstop wakes due pending/stale retry work without running model logic itself.',
    updated_at=clock_timestamp()
where user_id='459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid
  and scheduler_key='ai_reasoning_worker';
