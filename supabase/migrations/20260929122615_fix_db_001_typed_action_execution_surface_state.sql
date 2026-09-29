alter table public.actions
  add column surface_provider text,
  add column surface_external_id text,
  add column surface_last_external_id text,
  add column surface_project_id text,
  add column surface_parent_external_id text,
  add column surface_bundle_key text,
  add column surface_state text,
  add column surface_source text,
  add column surface_completion_source text,
  add column surface_surfaced_at timestamptz,
  add column surface_completed_at timestamptz,
  add column surface_removed_at timestamptz,
  add column surface_unsurface_requested_at timestamptz,
  add column surface_last_unsurfaced_at timestamptz,
  add column surface_last_sync_at timestamptz,
  add column surface_unsurface_reason text,
  add column surface_scheduler_controls boolean not null default false,
  add column surface_must_remain_open boolean not null default false,
  add column surface_continuous_required boolean not null default false,
  add column surface_policy text,
  add column surface_user_directive text,
  add column surface_contract_version smallint not null default 1;

comment on column public.actions.surface_provider is
  'Typed execution-surface provider. JSON constraint_flags is compatibility/provenance only.';
comment on column public.actions.surface_external_id is
  'Current external execution-surface object ID, for example a Todoist task ID.';
comment on column public.actions.surface_state is
  'Typed execution-surface lifecycle state used by scheduler decisions.';
comment on column public.actions.surface_contract_version is
  'Version of the typed action execution-surface persistence contract.';

update public.actions
set
  surface_provider = case
    when constraint_flags ?| array[
      'todoist_task_id','last_todoist_task_id','todoist_project_id',
      'todoist_tasks_project_id','todoist_parent_task_id','todoist_bundle_key',
      'surface_state','scheduler_controls_surface','surface_policy',
      'user_surface_directive'
    ] then 'todoist'
    else surface_provider
  end,
  surface_external_id = nullif(constraint_flags->>'todoist_task_id',''),
  surface_last_external_id = nullif(constraint_flags->>'last_todoist_task_id',''),
  surface_project_id = coalesce(
    nullif(constraint_flags->>'todoist_project_id',''),
    nullif(constraint_flags->>'todoist_tasks_project_id','')
  ),
  surface_parent_external_id = nullif(constraint_flags->>'todoist_parent_task_id',''),
  surface_bundle_key = nullif(constraint_flags->>'todoist_bundle_key',''),
  surface_state = nullif(constraint_flags->>'surface_state',''),
  surface_source = nullif(constraint_flags->>'surface_source',''),
  surface_completion_source = nullif(constraint_flags->>'completion_source',''),
  surface_surfaced_at = nullif(constraint_flags->>'surfaced_at','')::timestamptz,
  surface_completed_at = nullif(constraint_flags->>'todoist_completed_at','')::timestamptz,
  surface_removed_at = nullif(constraint_flags->>'surface_removed_at','')::timestamptz,
  surface_unsurface_requested_at = nullif(constraint_flags->>'unsurface_requested_at','')::timestamptz,
  surface_last_unsurfaced_at = nullif(constraint_flags->>'last_unsurfaced_at','')::timestamptz,
  surface_last_sync_at = nullif(constraint_flags->>'last_todoist_sync_at','')::timestamptz,
  surface_unsurface_reason = nullif(constraint_flags->>'unsurface_reason',''),
  surface_scheduler_controls = case
    when constraint_flags ? 'scheduler_controls_surface'
      then (constraint_flags->>'scheduler_controls_surface')::boolean
    else false
  end,
  surface_must_remain_open = case
    when constraint_flags ? 'must_remain_open_until_complete'
      then (constraint_flags->>'must_remain_open_until_complete')::boolean
    else false
  end,
  surface_continuous_required = case
    when constraint_flags ? 'continuous_surface_required'
      then (constraint_flags->>'continuous_surface_required')::boolean
    else false
  end,
  surface_policy = nullif(constraint_flags->>'surface_policy',''),
  surface_user_directive = nullif(constraint_flags->>'user_surface_directive','')
where constraint_flags <> '{}'::jsonb;

alter table public.actions
  add constraint actions_surface_provider_nonblank_check
    check (surface_provider is null or btrim(surface_provider) <> ''),
  add constraint actions_surface_state_check
    check (
      surface_state is null
      or surface_state in ('pending','surfaced','unsurfaced','completed','removed_by_user_reset')
    ),
  add constraint actions_surface_external_provider_check
    check (surface_external_id is null or surface_provider is not null),
  add constraint actions_surface_contract_version_check
    check (surface_contract_version >= 1);

create unique index actions_user_surface_external_id_key
  on public.actions(user_id,surface_provider,surface_external_id)
  where surface_external_id is not null;

create index actions_user_surface_state_due_idx
  on public.actions(user_id,surface_state,due_at)
  where surface_state is not null;

create or replace function private.sync_action_surface_columns_from_constraint_flags()
returns trigger
language plpgsql
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_insert boolean := tg_op='INSERT';
begin
  if v_insert
     or new.constraint_flags->'todoist_task_id'
        is distinct from old.constraint_flags->'todoist_task_id' then
    new.surface_external_id := nullif(new.constraint_flags->>'todoist_task_id','');
    if new.constraint_flags ? 'todoist_task_id' then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if v_insert
     or new.constraint_flags->'last_todoist_task_id'
        is distinct from old.constraint_flags->'last_todoist_task_id' then
    new.surface_last_external_id := nullif(new.constraint_flags->>'last_todoist_task_id','');
    if new.constraint_flags ? 'last_todoist_task_id' then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if v_insert
     or new.constraint_flags->'todoist_project_id'
        is distinct from old.constraint_flags->'todoist_project_id'
     or new.constraint_flags->'todoist_tasks_project_id'
        is distinct from old.constraint_flags->'todoist_tasks_project_id' then
    new.surface_project_id := coalesce(
      nullif(new.constraint_flags->>'todoist_project_id',''),
      nullif(new.constraint_flags->>'todoist_tasks_project_id','')
    );
    if new.constraint_flags ? 'todoist_project_id'
       or new.constraint_flags ? 'todoist_tasks_project_id' then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if v_insert
     or new.constraint_flags->'todoist_parent_task_id'
        is distinct from old.constraint_flags->'todoist_parent_task_id' then
    new.surface_parent_external_id := nullif(new.constraint_flags->>'todoist_parent_task_id','');
    if new.constraint_flags ? 'todoist_parent_task_id' then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if v_insert
     or new.constraint_flags->'todoist_bundle_key'
        is distinct from old.constraint_flags->'todoist_bundle_key' then
    new.surface_bundle_key := nullif(new.constraint_flags->>'todoist_bundle_key','');
    if new.constraint_flags ? 'todoist_bundle_key' then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if v_insert
     or new.constraint_flags->'surface_state'
        is distinct from old.constraint_flags->'surface_state' then
    new.surface_state := nullif(new.constraint_flags->>'surface_state','');
    if new.constraint_flags ? 'surface_state' and new.surface_provider is null then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if v_insert
     or new.constraint_flags->'surface_source'
        is distinct from old.constraint_flags->'surface_source' then
    new.surface_source := nullif(new.constraint_flags->>'surface_source','');
  end if;

  if v_insert
     or new.constraint_flags->'completion_source'
        is distinct from old.constraint_flags->'completion_source' then
    new.surface_completion_source := nullif(new.constraint_flags->>'completion_source','');
  end if;

  if v_insert
     or new.constraint_flags->'surfaced_at'
        is distinct from old.constraint_flags->'surfaced_at' then
    new.surface_surfaced_at := nullif(new.constraint_flags->>'surfaced_at','')::timestamptz;
  end if;

  if v_insert
     or new.constraint_flags->'todoist_completed_at'
        is distinct from old.constraint_flags->'todoist_completed_at' then
    new.surface_completed_at := nullif(new.constraint_flags->>'todoist_completed_at','')::timestamptz;
  end if;

  if v_insert
     or new.constraint_flags->'surface_removed_at'
        is distinct from old.constraint_flags->'surface_removed_at' then
    new.surface_removed_at := nullif(new.constraint_flags->>'surface_removed_at','')::timestamptz;
  end if;

  if v_insert
     or new.constraint_flags->'unsurface_requested_at'
        is distinct from old.constraint_flags->'unsurface_requested_at' then
    new.surface_unsurface_requested_at := nullif(new.constraint_flags->>'unsurface_requested_at','')::timestamptz;
  end if;

  if v_insert
     or new.constraint_flags->'last_unsurfaced_at'
        is distinct from old.constraint_flags->'last_unsurfaced_at' then
    new.surface_last_unsurfaced_at := nullif(new.constraint_flags->>'last_unsurfaced_at','')::timestamptz;
  end if;

  if v_insert
     or new.constraint_flags->'last_todoist_sync_at'
        is distinct from old.constraint_flags->'last_todoist_sync_at' then
    new.surface_last_sync_at := nullif(new.constraint_flags->>'last_todoist_sync_at','')::timestamptz;
  end if;

  if v_insert
     or new.constraint_flags->'unsurface_reason'
        is distinct from old.constraint_flags->'unsurface_reason' then
    new.surface_unsurface_reason := nullif(new.constraint_flags->>'unsurface_reason','');
  end if;

  if v_insert
     or new.constraint_flags->'scheduler_controls_surface'
        is distinct from old.constraint_flags->'scheduler_controls_surface' then
    new.surface_scheduler_controls := coalesce(
      nullif(new.constraint_flags->>'scheduler_controls_surface','')::boolean,
      false
    );
    if new.constraint_flags ? 'scheduler_controls_surface' and new.surface_provider is null then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if v_insert
     or new.constraint_flags->'must_remain_open_until_complete'
        is distinct from old.constraint_flags->'must_remain_open_until_complete' then
    new.surface_must_remain_open := coalesce(
      nullif(new.constraint_flags->>'must_remain_open_until_complete','')::boolean,
      false
    );
  end if;

  if v_insert
     or new.constraint_flags->'continuous_surface_required'
        is distinct from old.constraint_flags->'continuous_surface_required' then
    new.surface_continuous_required := coalesce(
      nullif(new.constraint_flags->>'continuous_surface_required','')::boolean,
      false
    );
  end if;

  if v_insert
     or new.constraint_flags->'surface_policy'
        is distinct from old.constraint_flags->'surface_policy' then
    new.surface_policy := nullif(new.constraint_flags->>'surface_policy','');
  end if;

  if v_insert
     or new.constraint_flags->'user_surface_directive'
        is distinct from old.constraint_flags->'user_surface_directive' then
    new.surface_user_directive := nullif(new.constraint_flags->>'user_surface_directive','');
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_action_surface_columns_from_constraint_flags()
  from public, anon, authenticated;

create trigger actions_sync_surface_columns_from_constraint_flags
before insert or update of constraint_flags on public.actions
for each row
execute function private.sync_action_surface_columns_from_constraint_flags();

create or replace function public.get_todoist_dispatch_actions(p_dispatch_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public','pg_temp'
as $function$
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
    a.surface_external_id as todoist_task_id,
    coalesce(a.surface_state,'pending') as surface_state,
    case
      when coalesce(a.surface_state,'pending')='unsurfaced'
           and a.surface_external_id is not null then 'remove'
      when coalesce(a.surface_state,'pending')='unsurfaced' then 'noop'
      when a.surface_external_id is null then 'create'
      else 'update'
    end as operation
  from ids
  join public.actions a on a.id=ids.action_id
  join d on d.user_id=a.user_id
  where a.status in ('planned','in_progress')
    and (a.surface_provider is null or a.surface_provider='todoist')
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
$function$;

create or replace function public.scheduler_record_todoist_surface_result(
  p_action_id uuid,
  p_operation text,
  p_todoist_task_id text,
  p_todoist_project_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_action public.actions%rowtype;
  v_now timestamptz := now();
  v_existing_task_id text;
begin
  select * into v_action from public.actions where id=p_action_id for update;
  if not found then raise exception 'Unknown action %',p_action_id; end if;

  if p_operation in ('create','update') then
    if p_todoist_task_id is null or btrim(p_todoist_task_id)='' then
      raise exception 'Todoist task id required for %',p_operation;
    end if;

    update public.actions
    set surface_provider='todoist',
        surface_external_id=p_todoist_task_id,
        surface_project_id=p_todoist_project_id,
        surface_state='surfaced',
        surface_surfaced_at=coalesce(surface_surfaced_at,v_now),
        surface_last_sync_at=v_now,
        surface_removed_at=null,
        surface_unsurface_requested_at=null,
        surface_unsurface_reason=null,
        constraint_flags =
          (constraint_flags - 'unsurface_requested_at' - 'unsurface_reason')
          || jsonb_build_object(
            'todoist_task_id',p_todoist_task_id,
            'todoist_project_id',p_todoist_project_id,
            'surface_state','surfaced',
            'surfaced_at',coalesce(surface_surfaced_at,v_now),
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
    v_existing_task_id := v_action.surface_external_id;

    if v_existing_task_id is not null
       and p_todoist_task_id is distinct from v_existing_task_id then
      raise exception 'Todoist task mismatch for action %',p_action_id;
    end if;

    update public.actions
    set surface_provider=coalesce(surface_provider,'todoist'),
        surface_last_external_id=coalesce(p_todoist_task_id,v_existing_task_id,surface_last_external_id),
        surface_external_id=null,
        surface_parent_external_id=null,
        surface_project_id=null,
        surface_state='unsurfaced',
        surface_removed_at=v_now,
        surface_last_unsurfaced_at=v_now,
        surface_last_sync_at=v_now,
        surface_unsurface_requested_at=null,
        constraint_flags =
          (constraint_flags
            - 'todoist_task_id'
            - 'todoist_project_id'
            - 'todoist_parent_task_id'
            - 'unsurface_requested_at')
          || jsonb_build_object(
            'last_todoist_task_id',coalesce(p_todoist_task_id,v_existing_task_id),
            'surface_state','unsurfaced',
            'surface_removed_at',v_now,
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
$function$;

create or replace function public.scheduler_apply_todoist_completion(
  p_user_id uuid,
  p_action_id uuid,
  p_completed_at timestamptz,
  p_todoist_task_id text
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_action public.actions%rowtype;
begin
  select * into v_action
  from public.actions
  where id=p_action_id and user_id=p_user_id
  for update;

  if not found then
    raise exception 'Unknown action % for user %',p_action_id,p_user_id;
  end if;

  if coalesce(v_action.surface_external_id,'') <> p_todoist_task_id then
    raise exception 'Todoist task mismatch for action %',p_action_id;
  end if;

  if v_action.status='completed' then
    update public.actions
    set surface_provider=coalesce(surface_provider,'todoist'),
        surface_state='completed',
        surface_completed_at=coalesce(surface_completed_at,p_completed_at),
        surface_completion_source=coalesce(surface_completion_source,'todoist'),
        constraint_flags=constraint_flags || jsonb_build_object(
          'surface_state','completed',
          'todoist_completed_at',coalesce(surface_completed_at,p_completed_at),
          'completion_source',coalesce(surface_completion_source,'todoist')
        ),
        updated_at=case
          when coalesce(surface_state,'')='completed' then updated_at
          else clock_timestamp()
        end
    where id=p_action_id and user_id=p_user_id;

    return jsonb_build_object(
      'action_id',p_action_id,
      'status','already_completed',
      'completed_at',p_completed_at,
      'surface_state','completed'
    );
  end if;

  update public.actions
  set status='completed',
      surface_provider=coalesce(surface_provider,'todoist'),
      surface_state='completed',
      surface_completed_at=p_completed_at,
      surface_completion_source='todoist',
      constraint_flags=constraint_flags || jsonb_build_object(
        'todoist_completed_at',p_completed_at,
        'completion_source','todoist',
        'surface_state','completed'
      ),
      updated_at=clock_timestamp()
  where id=p_action_id and user_id=p_user_id;

  if v_action.routine_event_id is not null then
    update public.routine_events
    set status='completed',
        completed_at=p_completed_at,
        updated_at=clock_timestamp()
    where id=v_action.routine_event_id
      and user_id=p_user_id;
  end if;

  insert into public.action_events(
    user_id,action_id,event_type,occurred_at,reason_code,note,metadata
  )
  values(
    p_user_id,p_action_id,'completed',p_completed_at,
    'todoist_completion',
    'Completion reconciled from linked Todoist task.',
    jsonb_build_object('todoist_task_id',p_todoist_task_id)
  );

  return jsonb_build_object(
    'action_id',p_action_id,
    'status','completed',
    'routine_event_id',v_action.routine_event_id,
    'completed_at',p_completed_at,
    'surface_state','completed'
  );
end;
$function$;

create or replace function public.scheduler_reconcile_todoist_completion(
  p_user_id uuid,
  p_todoist_task_id text,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_action public.actions%rowtype;
  v_count integer;
begin
  if nullif(btrim(p_todoist_task_id),'') is null or p_completed_at is null then
    raise exception 'Todoist completion requires task id and completed_at';
  end if;

  select count(*) into v_count
  from public.actions
  where user_id=p_user_id
    and surface_provider='todoist'
    and surface_external_id=p_todoist_task_id;

  if v_count=0 then
    return jsonb_build_object(
      'status','ignored_unlinked',
      'todoist_task_id',p_todoist_task_id
    );
  elsif v_count>1 then
    raise exception 'Ambiguous Todoist task linkage % for user %',p_todoist_task_id,p_user_id;
  end if;

  select * into v_action
  from public.actions
  where user_id=p_user_id
    and surface_provider='todoist'
    and surface_external_id=p_todoist_task_id
  for update;

  if v_action.status in ('cancelled','expired') then
    return jsonb_build_object(
      'status','ignored_terminal',
      'action_id',v_action.id,
      'action_status',v_action.status,
      'todoist_task_id',p_todoist_task_id
    );
  end if;

  return public.scheduler_apply_todoist_completion(
    p_user_id,
    v_action.id,
    p_completed_at,
    p_todoist_task_id
  );
end;
$function$;

create or replace function public.scheduler_mark_expired_routine_surfaces_unsurfaced(
  p_user_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_ids jsonb := '[]'::jsonb;
begin
  with targets as (
    select a.id
    from public.actions a
    where a.user_id = p_user_id
      and a.origin = 'routine'
      and a.status in ('planned','in_progress')
      and a.due_at is not null
      and a.due_at <= p_now
      and a.surface_provider='todoist'
      and a.surface_state='surfaced'
      and a.surface_external_id is not null
    for update
  ), updated as (
    update public.actions a
    set surface_state='unsurfaced',
        surface_unsurface_reason='expired_routine_window',
        surface_unsurface_requested_at=p_now,
        constraint_flags = a.constraint_flags || jsonb_build_object(
          'surface_state','unsurfaced',
          'unsurface_reason','expired_routine_window',
          'unsurface_requested_at',p_now
        ),
        updated_at = clock_timestamp()
    from targets t
    where a.id = t.id
    returning a.id
  )
  select coalesce(jsonb_agg(id::text),'[]'::jsonb)
  into v_ids
  from updated;

  return v_ids;
end;
$function$;

create or replace function public.claim_todoist_scheduler_dispatch()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
  v_expired_user uuid;
  v_expired_ids jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
begin
  select a.user_id
  into v_expired_user
  from public.actions a
  where a.origin='routine'
    and a.status in ('planned','in_progress')
    and a.due_at is not null
    and a.due_at <= v_now
    and a.surface_provider='todoist'
    and a.surface_state='surfaced'
    and a.surface_external_id is not null
  order by a.due_at,a.created_at
  limit 1;

  if v_expired_user is not null then
    v_expired_ids := public.scheduler_mark_expired_routine_surfaces_unsurfaced(v_expired_user,v_now);

    if jsonb_array_length(v_expired_ids) > 0 then
      insert into public.scheduler_dispatches(
        user_id,scheduler_key,scheduler_run_id,logical_hour,dispatch_kind,status,
        reasons,payload,completed_at,updated_at
      ) values (
        v_expired_user,
        'todoist_window_reconciler',
        null,
        date_trunc('minute',v_now),
        'reasoning_and_execution_surface',
        'completed',
        jsonb_build_array('expired_todoist_routine_window'),
        jsonb_build_object(
          'todoist_action_ids',v_expired_ids,
          'execution_surface','todoist',
          'source','todoist_window_reconciler'
        ),
        v_now,
        v_now
      )
      on conflict (user_id,scheduler_key,logical_hour,dispatch_kind)
      do update set
        reasons=excluded.reasons,
        payload=excluded.payload,
        status='completed',
        completed_at=v_now,
        external_status='pending',
        external_available_at=v_now,
        external_claimed_at=null,
        external_completed_at=null,
        external_last_error=null,
        updated_at=v_now;
    end if;
  end if;

  select d.* into v_dispatch
  from public.scheduler_dispatches d
  where d.dispatch_kind='reasoning_and_execution_surface'
    and (
      d.status='completed'
      or (
        d.status in ('pending','claimed','blocked','failed')
        and (
          coalesce(jsonb_array_length(coalesce(d.payload->'materialized_routine_actions','[]'::jsonb)),0) > 0
          or coalesce(jsonb_array_length(coalesce(d.payload->'todoist_action_ids','[]'::jsonb)),0) > 0
        )
      )
    )
    and d.external_status in ('pending','retry')
    and d.external_available_at <= now()
    and (d.external_claimed_at is null or d.external_claimed_at < now() - interval '10 minutes')
  order by d.logical_hour,d.created_at
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
$function$;

create or replace function public.me_scheduler_probe(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_temp'
as $function$
declare
  v_tz text;
  v_local_ts timestamp;
  v_local_date date;
  v_local_time time;
  v_last_deep timestamptz;
  v_last_external timestamptz;
  v_external_interval_hours integer := 4;
  v_latest_state_change timestamptz;
  v_state_changed boolean := false;
  v_external_refresh_due boolean := false;
  v_due_routines jsonb := '[]'::jsonb;
  v_due_actions jsonb := '[]'::jsonb;
  v_pending_signals jsonb := '[]'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_needs_ai boolean := false;
  v_newly_overdue_count integer := 0;
  v_unsurfaced_review_count integer := 0;
begin
  select coalesce(timezone,'Europe/Berlin')
  into v_tz
  from public.profiles
  where id=p_user_id;

  if v_tz is null then
    raise exception 'Unknown profile %',p_user_id;
  end if;

  v_local_ts := p_now at time zone v_tz;
  v_local_date := v_local_ts::date;
  v_local_time := v_local_ts::time;

  select
    last_deep_run_at,
    last_external_refresh_at,
    external_refresh_interval_hours
  into v_last_deep,v_last_external,v_external_interval_hours
  from private.scheduler_runtime_state
  where user_id=p_user_id;

  v_external_interval_hours := coalesce(v_external_interval_hours,4);

  v_external_refresh_due :=
    v_local_time >= '07:00'::time
    and v_local_time <= '23:59:59'::time
    and (
      v_last_external is null
      or p_now >= v_last_external + make_interval(hours => v_external_interval_hours)
    );

  select max(ts)
  into v_latest_state_change
  from (
    select updated_at as ts from public.routines where user_id=p_user_id
    union all
    select updated_at from public.routine_schedules where user_id=p_user_id
    union all
    select updated_at from public.routine_events where user_id=p_user_id
    union all
    select updated_at from public.actions where user_id=p_user_id
    union all
    select created_at from public.action_events where user_id=p_user_id
    union all
    select created_at from public.recommendations where user_id=p_user_id
    union all
    select updated_at from public.preferences
      where user_id=p_user_id
        and not (
          scope='action_engine'
          and key in ('scheduler_runtime_state','todoist_catalog_surface')
        )
  ) changes;

  v_state_changed :=
    v_last_deep is null
    or (v_latest_state_change is not null and v_latest_state_change > v_last_deep);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'routine_id',routine_id,
      'schedule_id',schedule_id,
      'title',title,
      'domain',domain,
      'importance',importance,
      'duration_minutes',duration_minutes,
      'window_start_local',window_start_local,
      'window_end_local',window_end_local,
      'bundle',bundle_name,
      'window_opened_at',window_opened_at,
      'routine_updated_at',routine_updated_at,
      'schedule_updated_at',schedule_updated_at
    )
    order by importance desc,title
  ),'[]'::jsonb)
  into v_due_routines
  from (
    select
      r.id as routine_id,
      rs.id as schedule_id,
      r.title,
      r.domain,
      r.importance,
      r.normal_duration_minutes as duration_minutes,
      rs.window_start_local,
      rs.window_end_local,
      rs.schedule_config->>'bundle' as bundle_name,
      ((v_local_date + rs.window_start_local) at time zone v_tz) as window_opened_at,
      r.updated_at as routine_updated_at,
      rs.updated_at as schedule_updated_at
    from public.routines r
    join public.routine_schedules rs
      on rs.routine_id=r.id and rs.user_id=r.user_id
    where r.user_id=p_user_id
      and r.active
      and rs.schedule_type='daily'
      and (rs.starts_on is null or v_local_date >= rs.starts_on)
      and (rs.ends_on is null or v_local_date <= rs.ends_on)
      and rs.window_start_local is not null
      and rs.window_end_local is not null
      and (
        (rs.window_start_local <= rs.window_end_local
          and v_local_time between rs.window_start_local and rs.window_end_local)
        or
        (rs.window_start_local > rs.window_end_local
          and (v_local_time >= rs.window_start_local or v_local_time <= rs.window_end_local))
      )
      and (
        v_last_deep is null
        or ((v_local_date + rs.window_start_local) at time zone v_tz) > v_last_deep
        or rs.updated_at > v_last_deep
        or r.updated_at > v_last_deep
      )
      and not exists (
        select 1
        from public.routine_events re
        where re.user_id=p_user_id
          and re.routine_id=r.id
          and re.occurrence_date=v_local_date
      )
  ) due;

  with eligible as (
    select
      a.*,
      case
        when v_last_deep is null or a.due_at > v_last_deep
          then 'newly_overdue'
        when v_external_refresh_due
             and a.surface_scheduler_controls
             and a.surface_state='unsurfaced'
             and a.surface_must_remain_open
          then 'unsurfaced_overdue_review'
        else null
      end as trigger_reason
    from public.actions a
    where a.user_id=p_user_id
      and a.status in ('proposed','planned','available','in_progress','partial')
      and a.due_at is not null
      and a.due_at <= p_now
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'action_id',id,
        'title',title,
        'domain',domain,
        'priority',priority,
        'due_at',due_at,
        'reason',reason,
        'trigger_reason',trigger_reason,
        'surface_state',surface_state
      )
      order by due_at nulls last,priority,title
    ) filter (where trigger_reason is not null),'[]'::jsonb),
    count(*) filter (where trigger_reason='newly_overdue'),
    count(*) filter (where trigger_reason='unsurfaced_overdue_review')
  into v_due_actions,v_newly_overdue_count,v_unsurfaced_review_count
  from eligible;

  v_pending_signals := public.get_pending_scheduler_signals(p_user_id,20);

  if jsonb_array_length(v_due_routines)>0 then
    v_reasons := v_reasons || jsonb_build_array('new_due_routine_window');
  end if;
  if v_newly_overdue_count>0 then
    v_reasons := v_reasons || jsonb_build_array('newly_overdue_action');
  end if;
  if v_unsurfaced_review_count>0 then
    v_reasons := v_reasons || jsonb_build_array('unsurfaced_overdue_action_review');
  end if;
  if jsonb_array_length(v_pending_signals)>0 then
    v_reasons := v_reasons || jsonb_build_array('pending_scheduler_signal');
  end if;
  if v_state_changed then
    v_reasons := v_reasons || jsonb_build_array('canonical_state_changed');
  end if;
  if v_external_refresh_due then
    v_reasons := v_reasons || jsonb_build_array('periodic_external_refresh');
  end if;

  v_needs_ai := jsonb_array_length(v_reasons)>0;

  return jsonb_build_object(
    'gate_version','v4',
    'needs_ai',v_needs_ai,
    'reasons',v_reasons,
    'as_of',p_now,
    'timezone',v_tz,
    'local_time',v_local_ts,
    'last_deep_run_at',v_last_deep,
    'last_external_refresh_at',v_last_external,
    'latest_state_change_at',v_latest_state_change,
    'external_refresh_due',v_external_refresh_due,
    'due_routines',v_due_routines,
    'newly_overdue_actions',v_due_actions,
    'pending_scheduler_signals',v_pending_signals
  );
end;
$function$;
