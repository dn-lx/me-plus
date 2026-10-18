create or replace function private.retry_pending_meplus_routine_surface_cleanup(
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_dispatch_id uuid;
  v_external_status text;
  v_available_at timestamptz;
  v_wake_request_id bigint;
begin
  select s.user_id
  into v_user_id
  from private.scheduler_runtime_state s
  where s.scheduler_policy_key='hourly_task_scheduler'
  order by s.updated_at desc
  limit 1;

  if v_user_id is null then
    raise exception 'Me+ scheduler user could not be resolved';
  end if;

  select d.id,d.external_status,d.external_available_at
  into v_dispatch_id,v_external_status,v_available_at
  from public.scheduler_dispatches d
  where d.user_id=v_user_id
    and d.scheduler_key='routine_surface_cutoff_cleanup'
    and d.dispatch_kind='reasoning_and_execution_surface'
    and d.external_status in ('pending','retry')
    and d.external_available_at <= p_now
    and (
      d.external_claimed_at is null
      or d.external_claimed_at < p_now - interval '10 minutes'
    )
  order by d.external_available_at,d.created_at
  limit 1;

  if v_dispatch_id is null then
    return jsonb_build_object(
      'status','no_pending_cleanup',
      'checked_at',p_now
    );
  end if;

  begin
    v_wake_request_id := private.wake_meplus_todoist_surface_cleanup();
  exception when others then
    return jsonb_build_object(
      'status','wake_failed',
      'dispatch_id',v_dispatch_id,
      'external_status',v_external_status,
      'external_available_at',v_available_at,
      'checked_at',p_now,
      'message',sqlerrm
    );
  end;

  return jsonb_build_object(
    'status','retry_wake_queued',
    'dispatch_id',v_dispatch_id,
    'external_status',v_external_status,
    'external_available_at',v_available_at,
    'checked_at',p_now,
    'wake_request_id',v_wake_request_id,
    'mode','removal_only'
  );
end;
$function$;

revoke all on function private.retry_pending_meplus_routine_surface_cleanup(timestamptz)
  from public,anon,authenticated;

select cron.unschedule('meplus-routine-surface-cutoff-retry')
where exists (
  select 1 from cron.job where jobname='meplus-routine-surface-cutoff-retry'
);

select cron.schedule(
  'meplus-routine-surface-cutoff-retry',
  '*/5 10-11,16-17,22-23 * * *',
  $$select private.retry_pending_meplus_routine_surface_cleanup();$$
);

update private.scheduler_runtime_registry
set runtime_kind='pg_cron',
    runtime_ref='supabase:pg_cron:meplus-routine-surface-cutoff-retry',
    cron_jobname='meplus-routine-surface-cutoff-retry',
    dispatch_phase=null,
    parent_scheduler_key='routine_surface_cutoff_cleanup',
    enabled_expected=true,
    heartbeat_required=false,
    expected_cadence_minutes=null,
    allowed_lateness_minutes=10,
    health_mode='unmetered',
    active_timezone='Europe/Berlin',
    active_start_local=null,
    active_end_local=null,
    schedule_anchor_local=null,
    daily_local_time=null,
    source_note='Removal-only retry backstop. Every five minutes during CET/CEST cutoff candidate UTC hours, wake only an already-pending/retry routine_surface_cutoff_cleanup dispatch whose external_available_at has elapsed. No planning, creation, rescheduling, completion inference or Catalog reconciliation.',
    updated_at=clock_timestamp()
where user_id='459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid
  and scheduler_key='routine_surface_cutoff_retry';

insert into private.scheduler_runtime_registry(
  user_id,scheduler_key,runtime_kind,runtime_ref,cron_jobname,dispatch_phase,
  parent_scheduler_key,enabled_expected,heartbeat_required,
  expected_cadence_minutes,allowed_lateness_minutes,health_mode,
  active_timezone,active_start_local,active_end_local,schedule_anchor_local,
  daily_local_time,source_note,updated_at
)
select
  '459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid,
  'routine_surface_cutoff_retry',
  'pg_cron',
  'supabase:pg_cron:meplus-routine-surface-cutoff-retry',
  'meplus-routine-surface-cutoff-retry',
  null,
  'routine_surface_cutoff_cleanup',
  true,
  false,
  null,
  10,
  'unmetered',
  'Europe/Berlin',
  null,
  null,
  null,
  null,
  'Removal-only retry backstop. Every five minutes during CET/CEST cutoff candidate UTC hours, wake only an already-pending/retry routine_surface_cutoff_cleanup dispatch whose external_available_at has elapsed. No planning, creation, rescheduling, completion inference or Catalog reconciliation.',
  clock_timestamp()
where not exists (
  select 1 from private.scheduler_runtime_registry
  where user_id='459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid
    and scheduler_key='routine_surface_cutoff_retry'
);

with old as (
  select *
  from public.scheduler_policies
  where user_id='459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid
    and policy_key='global'
    and status='active'
  for update
),
retired as (
  update public.scheduler_policies p
  set status='retired',updated_at=clock_timestamp()
  from old
  where p.id=old.id
  returning old.*
),
prepared as (
  select retired.*,
    jsonb_set(
      retired.policy,
      '{routine_surface_cutoffs}',
      coalesce(retired.policy->'routine_surface_cutoffs','{}'::jsonb)
        || jsonb_build_object(
          'external_retry_backstop_enabled',true,
          'external_retry_backstop_cadence_minutes',5,
          'external_retry_backstop_runtime','private.retry_pending_meplus_routine_surface_cleanup',
          'external_retry_backstop_removal_only',true,
          'protected_sleep_cleanup_retries_allowed',true,
          'planning_during_cleanup_retry',false
        ),
      true
    ) as new_policy
  from retired
)
insert into public.scheduler_policies(
  user_id,policy_key,policy_version,status,source_document_id,source_document_title,
  effective_from,policy,supersedes_id,policy_schema_version,policy_checksum
)
select
  user_id,policy_key,'1.27-draft','active',source_document_id,source_document_title,
  clock_timestamp(),new_policy,id,policy_schema_version,
  case when policy_checksum is null then null else md5(new_policy::text) end
from prepared;

with old as (
  select *
  from public.scheduler_policies
  where user_id='459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid
    and policy_key='hourly_task_scheduler'
    and status='active'
  for update
),
retired as (
  update public.scheduler_policies p
  set status='retired',updated_at=clock_timestamp()
  from old
  where p.id=old.id
  returning old.*
),
prepared as (
  select retired.*,
    jsonb_set(
      jsonb_set(
        retired.policy,
        '{routine_surface_cutoffs}',
        coalesce(retired.policy->'routine_surface_cutoffs','{}'::jsonb)
          || jsonb_build_object(
            'external_retry_backstop_enabled',true,
            'external_retry_backstop_cadence_minutes',5,
            'external_retry_backstop_runtime','private.retry_pending_meplus_routine_surface_cleanup',
            'external_retry_backstop_removal_only',true,
            'protected_sleep_cleanup_retries_allowed',true,
            'planning_during_cleanup_retry',false
          ),
        true
      ),
      '{execution_surface_reconciliation}',
      coalesce(retired.policy->'execution_surface_reconciliation','{}'::jsonb)
        || jsonb_build_object(
          'cleanup_retry_backstop_outside_planning_window',true,
          'cleanup_retry_requires_existing_dispatch',true
        ),
      true
    ) as new_policy
  from retired
)
insert into public.scheduler_policies(
  user_id,policy_key,policy_version,status,source_document_id,source_document_title,
  effective_from,policy,supersedes_id,policy_schema_version,policy_checksum
)
select
  user_id,policy_key,'1.27-draft','active',source_document_id,source_document_title,
  clock_timestamp(),new_policy,id,policy_schema_version,
  case when policy_checksum is null then null else md5(new_policy::text) end
from prepared;

update private.scheduler_runtime_state
set scheduler_policy_version='1.27-draft',
    updated_at=clock_timestamp()
where user_id='459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid
  and scheduler_policy_key='hourly_task_scheduler';
