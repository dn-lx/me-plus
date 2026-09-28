
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
  v_terminal boolean;
begin
  if p_status not in ('invoked','no_op','started','completed','failed','skipped_overlap') then
    raise exception 'invalid scheduler heartbeat status: %', p_status;
  end if;

  v_terminal := p_status in ('no_op','completed','failed','skipped_overlap');

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
    p_status,p_error,p_policy_version,
    case when p_status='started' then p_run_id else null end,
    v_now
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
      current_run_id = case when p_status='started' then p_run_id else null end,
      updated_at = v_now;

  return jsonb_build_object(
    'scheduler_key',p_scheduler_key,
    'status',p_status,
    'recorded_at',v_now,
    'current_run_id',case when p_status='started' then p_run_id else null end
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
  with h as (
    select *,
      coalesce(last_invoked_at,last_succeeded_at,last_failed_at) as last_observed_at
    from public.scheduler_heartbeats
    where user_id=p_user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'scheduler_key',scheduler_key,
    'automation_id',automation_id,
    'expected_cadence_minutes',expected_cadence_minutes,
    'allowed_lateness_minutes',allowed_lateness_minutes,
    'last_invoked_at',last_invoked_at,
    'last_observed_at',last_observed_at,
    'last_succeeded_at',last_succeeded_at,
    'last_failed_at',last_failed_at,
    'last_status',last_status,
    'last_error',last_error,
    'last_policy_version',last_policy_version,
    'current_run_id',current_run_id,
    'health_status',case
      when last_observed_at is null then 'never_recorded'
      when last_status='failed' then 'failed'
      when expected_cadence_minutes is not null
       and now() > last_observed_at
          + make_interval(mins => expected_cadence_minutes + allowed_lateness_minutes)
        then 'late'
      else 'healthy'
    end,
    'next_expected_by',case
      when last_observed_at is not null and expected_cadence_minutes is not null
      then last_observed_at + make_interval(mins => expected_cadence_minutes + allowed_lateness_minutes)
      else null end
  ) order by scheduler_key),'[]'::jsonb)
  from h;
$$;

-- Historical production-state cleanup intentionally omitted from replay.
-- The original remote migration also repaired one existing heartbeat row.

revoke all on function public.record_scheduler_heartbeat(uuid,text,text,text,jsonb,integer,integer,uuid,text)
from public,anon,authenticated;
revoke all on function public.get_scheduler_health(uuid)
from public,anon,authenticated;
grant execute on function public.record_scheduler_heartbeat(uuid,text,text,text,jsonb,integer,integer,uuid,text)
to service_role;
grant execute on function public.get_scheduler_health(uuid)
to service_role;
