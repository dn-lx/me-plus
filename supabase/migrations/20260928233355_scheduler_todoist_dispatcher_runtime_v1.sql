alter table public.scheduler_dispatches
  add column if not exists external_status text not null default 'pending',
  add column if not exists external_attempts integer not null default 0,
  add column if not exists external_available_at timestamptz not null default now(),
  add column if not exists external_claimed_at timestamptz,
  add column if not exists external_completed_at timestamptz,
  add column if not exists external_last_error jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.scheduler_dispatches'::regclass
      and conname='scheduler_dispatches_external_status_check'
  ) then
    alter table public.scheduler_dispatches
      add constraint scheduler_dispatches_external_status_check
      check (external_status in ('pending','processing','retry','completed','not_required','blocked'));
  end if;
end $$;

-- Historical dispatches predate the autonomous Todoist adapter. Do not replay them.
update public.scheduler_dispatches
set external_status = case
      when coalesce(jsonb_array_length(coalesce(payload->'todoist_task_ids','[]'::jsonb)),0) > 0
        or coalesce((payload->>'manual_transition_bridge')::boolean,false)
        then 'completed'
      else 'not_required'
    end,
    external_completed_at = coalesce(updated_at, now())
where external_status='pending';

create index if not exists scheduler_dispatches_external_claim_idx
  on public.scheduler_dispatches(external_status, external_available_at, logical_hour)
  where dispatch_kind='reasoning_and_execution_surface';

-- Independent wake secret: protects the public Edge Function wake surface without
-- exposing the Todoist credential to callers or source control.
do $$
begin
  if not exists (select 1 from vault.secrets where name='meplus_todoist_dispatcher_wake_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'meplus_todoist_dispatcher_wake_secret',
      'Shared secret used only to authenticate Supabase pg_cron wake calls to the Todoist dispatcher.',
      null
    );
  end if;
end $$;

create or replace function public.todoist_dispatcher_wake_authorized(p_secret text)
returns boolean
language sql
security definer
set search_path = vault, pg_temp
as $$
  select p_secret is not null and exists (
    select 1 from vault.decrypted_secrets
    where name='meplus_todoist_dispatcher_wake_secret'
      and decrypted_secret=p_secret
  );
$$;

create or replace function public.get_todoist_dispatcher_config()
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_token text;
  v_project_name text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='meplus_todoist_api_token'
  limit 1;

  select policy#>>'{todoist,project_name}' into v_project_name
  from public.scheduler_policies
  where policy_key='hourly_task_scheduler' and status='active'
  order by effective_from desc, created_at desc
  limit 1;

  return jsonb_build_object(
    'api_token', v_token,
    'project_name', coalesce(v_project_name,'Me+ Tasks'),
    'api_base_url', 'https://api.todoist.com/api/v1'
  );
end;
$$;

create or replace function public.claim_todoist_scheduler_dispatch()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
begin
  select d.* into v_dispatch
  from public.scheduler_dispatches d
  where d.dispatch_kind='reasoning_and_execution_surface'
    and d.status='completed'
    and d.external_status in ('pending','retry')
    and d.external_available_at <= now()
    and (d.external_claimed_at is null or d.external_claimed_at < now() - interval '10 minutes')
  order by d.logical_hour, d.created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.scheduler_dispatches
  set external_status='processing',
      external_attempts=external_attempts+1,
      external_claimed_at=now(),
      external_last_error=null,
      updated_at=now()
  where id=v_dispatch.id
  returning * into v_dispatch;

  return to_jsonb(v_dispatch);
end;
$$;

create or replace function public.get_todoist_dispatch_actions(p_dispatch_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
with d as (
  select user_id,payload
  from public.scheduler_dispatches
  where id=p_dispatch_id
), raw_ids as (
  select nullif(x->>'action_id','')::uuid as action_id
  from d, lateral jsonb_array_elements(coalesce(d.payload->'materialized_routine_actions','[]'::jsonb)) x
  union
  select nullif(x->>'action_id','')::uuid as action_id
  from d, lateral jsonb_array_elements(coalesce(d.payload->'newly_overdue_actions','[]'::jsonb)) x
  union
  select nullif(x,'')::uuid as action_id
  from d, lateral jsonb_array_elements_text(coalesce(d.payload#>'{ai_reasoning,action_ids}','[]'::jsonb)) x
  union
  select nullif(x,'')::uuid as action_id
  from d, lateral jsonb_array_elements_text(coalesce(d.payload->'todoist_action_ids','[]'::jsonb)) x
), ids as (
  select distinct action_id from raw_ids where action_id is not null
), rows as (
  select
    a.id,
    a.user_id,
    a.title,
    a.instructions,
    a.priority,
    a.status,
    a.available_from,
    a.due_at,
    a.updated_at,
    a.constraint_flags,
    nullif(a.constraint_flags->>'todoist_task_id','') as todoist_task_id,
    coalesce(nullif(a.constraint_flags->>'surface_state',''),'pending') as surface_state,
    case
      when coalesce(nullif(a.constraint_flags->>'surface_state',''),'pending')='unsurfaced'
           and nullif(a.constraint_flags->>'todoist_task_id','') is not null then 'remove'
      when coalesce(nullif(a.constraint_flags->>'surface_state',''),'pending')='unsurfaced' then 'noop'
      when nullif(a.constraint_flags->>'todoist_task_id','') is null then 'create'
      else 'update'
    end as operation
  from ids
  join public.actions a on a.id=ids.action_id
  join d on d.user_id=a.user_id
  where a.status in ('planned','in_progress')
)
select coalesce(jsonb_agg(jsonb_build_object(
  'action_id',id,
  'title',title,
  'description',coalesce(instructions,''),
  'priority',priority,
  'status',status,
  'available_from',available_from,
  'due_at',due_at,
  'updated_at',updated_at,
  'todoist_task_id',todoist_task_id,
  'surface_state',surface_state,
  'operation',operation
) order by due_at nulls last,id),'[]'::jsonb)
from rows;
$$;

create or replace function public.scheduler_record_todoist_surface_result(
  p_action_id uuid,
  p_operation text,
  p_todoist_task_id text,
  p_todoist_project_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.actions%rowtype;
  v_now timestamptz := now();
begin
  select * into v_action from public.actions where id=p_action_id for update;
  if not found then raise exception 'Unknown action %',p_action_id; end if;

  if p_operation in ('create','update') then
    if p_todoist_task_id is null or btrim(p_todoist_task_id)='' then
      raise exception 'Todoist task id required for %',p_operation;
    end if;
    update public.actions
    set constraint_flags = constraint_flags || jsonb_build_object(
          'todoist_task_id',p_todoist_task_id,
          'todoist_project_id',p_todoist_project_id,
          'surface_state','surfaced',
          'last_todoist_sync_at',v_now
        ),
        updated_at=v_now
    where id=p_action_id;

    insert into public.action_events(user_id,action_id,event_type,occurred_at,reason_code,note,metadata)
    values(v_action.user_id,p_action_id,
      case when p_operation='create' then 'external_surface_created' else 'external_surface_updated' end,
      v_now,
      case when p_operation='create' then 'todoist_surface_created' else 'todoist_surface_updated' end,
      'Todoist execution surface reconciled by the server-side dispatcher.',
      jsonb_build_object('todoist_task_id',p_todoist_task_id,'todoist_project_id',p_todoist_project_id));

  elsif p_operation='remove' then
    if nullif(v_action.constraint_flags->>'todoist_task_id','') is not null
       and p_todoist_task_id is distinct from v_action.constraint_flags->>'todoist_task_id' then
      raise exception 'Todoist task mismatch for action %',p_action_id;
    end if;

    update public.actions
    set constraint_flags = (constraint_flags - 'todoist_task_id' - 'todoist_project_id') || jsonb_build_object(
          'last_todoist_task_id',coalesce(p_todoist_task_id,v_action.constraint_flags->>'todoist_task_id'),
          'surface_state','unsurfaced',
          'last_unsurfaced_at',v_now,
          'last_todoist_sync_at',v_now
        ),
        updated_at=v_now
    where id=p_action_id;

    insert into public.action_events(user_id,action_id,event_type,occurred_at,reason_code,note,metadata)
    values(v_action.user_id,p_action_id,'external_surface_removed',v_now,'todoist_surface_removed',
      'Todoist execution surface removed after confirmed external removal.',
      jsonb_build_object('todoist_task_id',p_todoist_task_id,'todoist_project_id',p_todoist_project_id));
  else
    raise exception 'Unsupported Todoist surface operation %',p_operation;
  end if;

  return jsonb_build_object('action_id',p_action_id,'operation',p_operation,'todoist_task_id',p_todoist_task_id);
end;
$$;

create or replace function public.finish_todoist_scheduler_dispatch(
  p_dispatch_id uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
  v_policy text;
begin
  if p_status not in ('completed','not_required') then
    raise exception 'Invalid terminal external status %',p_status;
  end if;

  update public.scheduler_dispatches
  set external_status=p_status,
      external_completed_at=now(),
      external_claimed_at=null,
      external_last_error=null,
      payload=payload || jsonb_build_object(
        'external_execution_status',p_status,
        'todoist_execution',coalesce(p_result,'{}'::jsonb)
      ),
      updated_at=now()
  where id=p_dispatch_id and external_status in ('processing',p_status)
  returning * into v_dispatch;

  if not found then raise exception 'Todoist dispatch % is not processing/terminal',p_dispatch_id; end if;
  v_policy := coalesce(v_dispatch.payload->>'policy_version','1.14-draft');

  perform public.record_scheduler_heartbeat(
    v_dispatch.user_id,'todoist_execution_dispatcher','completed',v_policy,null,
    1,5,v_dispatch.scheduler_run_id,null
  );

  return jsonb_build_object('dispatch_id',p_dispatch_id,'external_status',p_status);
end;
$$;

create or replace function public.fail_todoist_scheduler_dispatch(
  p_dispatch_id uuid,
  p_error jsonb,
  p_retryable boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
  v_next text;
  v_delay integer;
  v_policy text;
begin
  select * into v_dispatch from public.scheduler_dispatches where id=p_dispatch_id for update;
  if not found then raise exception 'Unknown dispatch %',p_dispatch_id; end if;

  v_next := case when p_retryable and v_dispatch.external_attempts < 5 then 'retry' else 'blocked' end;
  v_delay := least(30, greatest(1, (power(2,greatest(v_dispatch.external_attempts-1,0)))::integer));

  update public.scheduler_dispatches
  set external_status=v_next,
      external_available_at=case when v_next='retry' then now()+make_interval(mins=>v_delay) else external_available_at end,
      external_claimed_at=null,
      external_last_error=coalesce(p_error,'{}'::jsonb),
      updated_at=now()
  where id=p_dispatch_id;

  v_policy := coalesce(v_dispatch.payload->>'policy_version','1.14-draft');
  perform public.record_scheduler_heartbeat(
    v_dispatch.user_id,'todoist_execution_dispatcher','failed',v_policy,coalesce(p_error,'{}'::jsonb),
    1,5,v_dispatch.scheduler_run_id,null
  );

  return jsonb_build_object('dispatch_id',p_dispatch_id,'external_status',v_next,'retry_delay_minutes',case when v_next='retry' then v_delay else null end);
end;
$$;

create or replace function public.record_todoist_dispatcher_wake(p_status text, p_error jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_policy text;
begin
  select user_id,policy_version into v_user_id,v_policy
  from public.scheduler_policies
  where policy_key='hourly_task_scheduler' and status='active'
  order by effective_from desc,created_at desc
  limit 1;
  if v_user_id is not null then
    perform public.record_scheduler_heartbeat(v_user_id,'todoist_execution_dispatcher',p_status,coalesce(v_policy,'1.14-draft'),p_error,1,5,null,null);
  end if;
end;
$$;

revoke all on function public.todoist_dispatcher_wake_authorized(text) from public,anon,authenticated;
revoke all on function public.get_todoist_dispatcher_config() from public,anon,authenticated;
revoke all on function public.claim_todoist_scheduler_dispatch() from public,anon,authenticated;
revoke all on function public.get_todoist_dispatch_actions(uuid) from public,anon,authenticated;
revoke all on function public.scheduler_record_todoist_surface_result(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.finish_todoist_scheduler_dispatch(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.fail_todoist_scheduler_dispatch(uuid,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.record_todoist_dispatcher_wake(text,jsonb) from public,anon,authenticated;

grant execute on function public.todoist_dispatcher_wake_authorized(text) to service_role;
grant execute on function public.get_todoist_dispatcher_config() to service_role;
grant execute on function public.claim_todoist_scheduler_dispatch() to service_role;
grant execute on function public.get_todoist_dispatch_actions(uuid) to service_role;
grant execute on function public.scheduler_record_todoist_surface_result(uuid,text,text,text) to service_role;
grant execute on function public.finish_todoist_scheduler_dispatch(uuid,text,jsonb) to service_role;
grant execute on function public.fail_todoist_scheduler_dispatch(uuid,jsonb,boolean) to service_role;
grant execute on function public.record_todoist_dispatcher_wake(text,jsonb) to service_role;

create or replace function private.wake_meplus_todoist_dispatcher()
returns bigint
language plpgsql
security definer
set search_path = private, vault, net, pg_temp
as $$
declare
  v_url text;
  v_key text;
  v_wake text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='meplus_project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='meplus_worker_publishable_key' limit 1;
  select decrypted_secret into v_wake from vault.decrypted_secrets where name='meplus_todoist_dispatcher_wake_secret' limit 1;
  if v_url is null or v_key is null or v_wake is null then return null; end if;

  select net.http_post(
    url => rtrim(v_url,'/') || '/functions/v1/me-plus-todoist-dispatcher',
    headers => jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_key,
      'x-meplus-wake-secret',v_wake
    ),
    body => '{}'::jsonb,
    timeout_milliseconds => 15000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function private.wake_meplus_todoist_dispatcher() from public,anon,authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='meplus-todoist-execution-dispatcher';

select cron.schedule(
  'meplus-todoist-execution-dispatcher',
  '* * * * *',
  $$select private.wake_meplus_todoist_dispatcher();$$
);
