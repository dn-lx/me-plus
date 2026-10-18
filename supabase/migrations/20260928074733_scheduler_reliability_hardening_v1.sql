
alter table public.scheduler_policies
  add column if not exists policy_schema_version integer not null default 1,
  add column if not exists policy_checksum text;

alter table public.scheduler_run_log
  add column if not exists scheduler_key text,
  add column if not exists policy_version text,
  add column if not exists idempotency_key text;

create unique index if not exists scheduler_run_log_user_scheduler_idempotency_uidx
  on public.scheduler_run_log(user_id, scheduler_key, idempotency_key)
  where idempotency_key is not null and scheduler_key is not null;

create table if not exists public.scheduler_heartbeats (
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduler_key text not null,
  automation_id text,
  expected_cadence_minutes integer check (expected_cadence_minutes is null or expected_cadence_minutes > 0),
  allowed_lateness_minutes integer not null default 15 check (allowed_lateness_minutes >= 0),
  last_invoked_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_status text,
  last_error jsonb,
  last_policy_version text,
  current_run_id uuid,
  updated_at timestamptz not null default now(),
  primary key (user_id, scheduler_key)
);

create table if not exists public.scheduler_leases (
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduler_key text not null,
  run_id uuid not null,
  lease_acquired_at timestamptz not null default now(),
  lease_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, scheduler_key)
);

alter table public.scheduler_heartbeats enable row level security;
alter table public.scheduler_leases enable row level security;

revoke all on public.scheduler_heartbeats from public, anon, authenticated;
revoke all on public.scheduler_leases from public, anon, authenticated;
grant all on public.scheduler_heartbeats to service_role;
grant all on public.scheduler_leases to service_role;

comment on table public.scheduler_heartbeats is
'Proof-of-life and scheduler health state for every automation invocation, including no-op runs.';
comment on table public.scheduler_leases is
'Short-lived per-user/per-scheduler leases used to prevent overlapping deep scheduler runs.';

create or replace function public.record_scheduler_heartbeat(
  p_user_id uuid,
  p_scheduler_key text,
  p_status text,
  p_policy_version text default null,
  p_error jsonb default null,
  p_expected_cadence_minutes integer default null,
  p_allowed_lateness_minutes integer default null,
  p_run_id uuid default null,
  p_automation_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  if p_status not in ('invoked','no_op','started','completed','failed','skipped_overlap') then
    raise exception 'invalid scheduler heartbeat status: %', p_status;
  end if;

  insert into public.scheduler_heartbeats(
    user_id,scheduler_key,automation_id,expected_cadence_minutes,allowed_lateness_minutes,
    last_invoked_at,last_succeeded_at,last_failed_at,last_status,last_error,last_policy_version,
    current_run_id,updated_at
  )
  values(
    p_user_id,p_scheduler_key,p_automation_id,p_expected_cadence_minutes,coalesce(p_allowed_lateness_minutes,15),
    v_now,
    case when p_status in ('no_op','completed','skipped_overlap') then v_now else null end,
    case when p_status='failed' then v_now else null end,
    p_status,p_error,p_policy_version,p_run_id,v_now
  )
  on conflict (user_id,scheduler_key) do update
  set automation_id = coalesce(excluded.automation_id, scheduler_heartbeats.automation_id),
      expected_cadence_minutes = coalesce(excluded.expected_cadence_minutes, scheduler_heartbeats.expected_cadence_minutes),
      allowed_lateness_minutes = coalesce(p_allowed_lateness_minutes, scheduler_heartbeats.allowed_lateness_minutes),
      last_invoked_at = v_now,
      last_succeeded_at = case
        when p_status in ('no_op','completed','skipped_overlap') then v_now
        else scheduler_heartbeats.last_succeeded_at end,
      last_failed_at = case
        when p_status='failed' then v_now
        else scheduler_heartbeats.last_failed_at end,
      last_status = p_status,
      last_error = case when p_status='failed' then p_error else null end,
      last_policy_version = coalesce(p_policy_version, scheduler_heartbeats.last_policy_version),
      current_run_id = p_run_id,
      updated_at = v_now;

  return jsonb_build_object(
    'scheduler_key',p_scheduler_key,
    'status',p_status,
    'recorded_at',v_now
  );
end;
$$;

create or replace function public.get_scheduler_health(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'scheduler_key',scheduler_key,
    'automation_id',automation_id,
    'expected_cadence_minutes',expected_cadence_minutes,
    'allowed_lateness_minutes',allowed_lateness_minutes,
    'last_invoked_at',last_invoked_at,
    'last_succeeded_at',last_succeeded_at,
    'last_failed_at',last_failed_at,
    'last_status',last_status,
    'last_error',last_error,
    'last_policy_version',last_policy_version,
    'current_run_id',current_run_id,
    'health_status',case
      when last_invoked_at is null then 'never_recorded'
      when expected_cadence_minutes is not null
       and now() > last_invoked_at
          + make_interval(mins => expected_cadence_minutes + allowed_lateness_minutes)
        then 'late'
      when last_status='failed' then 'failed'
      else 'healthy'
    end,
    'next_expected_by',case
      when last_invoked_at is not null and expected_cadence_minutes is not null
      then last_invoked_at + make_interval(mins => expected_cadence_minutes + allowed_lateness_minutes)
      else null end
  ) order by scheduler_key),'[]'::jsonb)
  from public.scheduler_heartbeats
  where user_id=p_user_id;
$$;

create or replace function public.try_acquire_scheduler_lease(
  p_user_id uuid,
  p_scheduler_key text,
  p_run_id uuid,
  p_lease_seconds integer default 900
)
returns boolean
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  with acquired as (
    insert into public.scheduler_leases(user_id,scheduler_key,run_id,lease_acquired_at,lease_until,updated_at)
    values(p_user_id,p_scheduler_key,p_run_id,now(),now()+make_interval(secs => greatest(p_lease_seconds,30)),now())
    on conflict (user_id,scheduler_key) do update
      set run_id=excluded.run_id,
          lease_acquired_at=excluded.lease_acquired_at,
          lease_until=excluded.lease_until,
          updated_at=excluded.updated_at
      where scheduler_leases.lease_until <= now()
         or scheduler_leases.run_id = excluded.run_id
    returning 1
  )
  select exists(select 1 from acquired);
$$;

create or replace function public.release_scheduler_lease(
  p_user_id uuid,
  p_scheduler_key text,
  p_run_id uuid
)
returns boolean
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  with released as (
    delete from public.scheduler_leases
    where user_id=p_user_id
      and scheduler_key=p_scheduler_key
      and run_id=p_run_id
    returning 1
  )
  select exists(select 1 from released);
$$;

create or replace function public.begin_scheduler_run(
  p_user_id uuid,
  p_scheduler_key text,
  p_scheduler_name text,
  p_trigger_mode text,
  p_gate_version text,
  p_needs_ai boolean,
  p_reasons jsonb default '[]'::jsonb,
  p_signal_ids jsonb default '[]'::jsonb,
  p_policy_version text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.scheduler_run_log(
    user_id,scheduler_key,scheduler_name,trigger_mode,gate_version,needs_ai,reasons,signal_ids,
    policy_version,idempotency_key,status
  )
  values(
    p_user_id,p_scheduler_key,p_scheduler_name,p_trigger_mode,p_gate_version,p_needs_ai,
    coalesce(p_reasons,'[]'::jsonb),coalesce(p_signal_ids,'[]'::jsonb),
    p_policy_version,p_idempotency_key,'started'
  )
  on conflict (user_id,scheduler_key,idempotency_key)
    where idempotency_key is not null and scheduler_key is not null
  do update set scheduler_name=excluded.scheduler_name
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finish_scheduler_run(
  p_user_id uuid,
  p_run_id uuid,
  p_status text,
  p_sources_checked jsonb default '[]'::jsonb,
  p_changes_made jsonb default '[]'::jsonb,
  p_error jsonb default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('completed','failed','no_op') then
    raise exception 'invalid scheduler run finish status: %', p_status;
  end if;

  update public.scheduler_run_log
  set finished_at=now(),
      status=p_status,
      sources_checked=coalesce(p_sources_checked,'[]'::jsonb),
      changes_made=coalesce(p_changes_made,'[]'::jsonb),
      error=p_error
  where id=p_run_id and user_id=p_user_id;

  return found;
end;
$$;

revoke all on function public.record_scheduler_heartbeat(uuid,text,text,text,jsonb,integer,integer,uuid,text) from public,anon,authenticated;
revoke all on function public.get_scheduler_health(uuid) from public,anon,authenticated;
revoke all on function public.try_acquire_scheduler_lease(uuid,text,uuid,integer) from public,anon,authenticated;
revoke all on function public.release_scheduler_lease(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.begin_scheduler_run(uuid,text,text,text,text,boolean,jsonb,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.finish_scheduler_run(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;

grant execute on function public.record_scheduler_heartbeat(uuid,text,text,text,jsonb,integer,integer,uuid,text) to service_role;
grant execute on function public.get_scheduler_health(uuid) to service_role;
grant execute on function public.try_acquire_scheduler_lease(uuid,text,uuid,integer) to service_role;
grant execute on function public.release_scheduler_lease(uuid,text,uuid) to service_role;
grant execute on function public.begin_scheduler_run(uuid,text,text,text,text,boolean,jsonb,jsonb,text,text) to service_role;
grant execute on function public.finish_scheduler_run(uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;

comment on function public.record_scheduler_heartbeat(uuid,text,text,text,jsonb,integer,integer,uuid,text) is
'Records proof-of-life for scheduler invocations, including normal no-op runs.';
comment on function public.get_scheduler_health(uuid) is
'Returns deterministic heartbeat-based scheduler health for watchdog evaluation.';
comment on function public.try_acquire_scheduler_lease(uuid,text,uuid,integer) is
'Atomically acquires a short lease to prevent overlapping deep runs for one scheduler/user.';
comment on function public.begin_scheduler_run(uuid,text,text,text,text,boolean,jsonb,jsonb,text,text) is
'Starts an idempotent deep-run log entry using a stable scheduler key and optional idempotency key.';
