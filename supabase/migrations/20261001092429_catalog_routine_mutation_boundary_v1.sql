create or replace function private.catalog_mutate_routine(
  p_user_id uuid,
  p_operation text,
  p_routine_id uuid default null,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
  v_title text := nullif(btrim(p_title),'');
begin
  if p_user_id is null then
    raise exception 'catalog routine mutation requires user_id';
  end if;

  if p_operation='create' then
    if v_title is null then raise exception 'catalog routine title is required'; end if;

    insert into public.routines(
      user_id,domain,title,instructions,importance,normal_duration_minutes,
      normal_definition,notification_policy,active
    )
    values(
      p_user_id,'general',v_title,
      'User-created routine from the Me+ Catalog Todoist configuration surface.',
      3,5,
      jsonb_build_object(
        'source','todoist_catalog',
        'action_type','routine',
        'cadence_hint','unspecified',
        'configuration_status','enabled_user_authored_pending_configuration'
      ),
      jsonb_build_object(
        'surface','todoist',
        'creation','hourly_action_engine_only',
        'reminders',false,
        'catalog_managed',true,
        'needs_schedule_configuration',true
      ),
      true
    )
    returning id into v_id;

  elsif p_operation='rename' then
    if p_routine_id is null or v_title is null then
      raise exception 'catalog routine rename requires routine_id and title';
    end if;

    update public.routines
    set title=v_title,updated_at=clock_timestamp()
    where user_id=p_user_id and id=p_routine_id
    returning id into v_id;

    if v_id is null then raise exception 'unknown catalog routine %',p_routine_id; end if;

    update public.routine_bundle_steps
    set child_title=v_title,updated_at=clock_timestamp()
    where user_id=p_user_id and routine_id=p_routine_id and active;

    update public.routines
    set notification_policy=jsonb_set(
          notification_policy,
          '{todoist_bundle,child_title}',
          to_jsonb(v_title),
          true
        ),
        updated_at=clock_timestamp()
    where user_id=p_user_id
      and id=p_routine_id
      and notification_policy ? 'todoist_bundle';

  elsif p_operation='deactivate' then
    if p_routine_id is null then
      raise exception 'catalog routine deactivate requires routine_id';
    end if;

    update public.routines
    set active=false,
        normal_definition=normal_definition || jsonb_build_object(
          'deactivated_via','todoist_catalog_delete',
          'deactivated_at',clock_timestamp()
        ),
        updated_at=clock_timestamp()
    where user_id=p_user_id and id=p_routine_id
    returning id into v_id;

    if v_id is null then raise exception 'unknown catalog routine %',p_routine_id; end if;

    update public.routine_bundle_steps
    set active=false,updated_at=clock_timestamp()
    where user_id=p_user_id and routine_id=p_routine_id and active;

  else
    raise exception 'unsupported catalog routine operation %',p_operation;
  end if;

  return v_id;
end;
$function$;

revoke all on function private.catalog_mutate_routine(uuid,text,uuid,text)
  from public,anon,authenticated;
grant execute on function private.catalog_mutate_routine(uuid,text,uuid,text)
  to service_role;

create or replace function public.catalog_create_routine_from_todoist(
  p_user_id uuid,
  p_title text,
  p_todoist_task_id text,
  p_project_id text,
  p_section_id text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_routine_id uuid;
begin
  if nullif(btrim(p_title),'') is null then
    raise exception 'catalog routine title is required';
  end if;

  if exists(
    select 1 from public.todoist_catalog_items
    where user_id=p_user_id and todoist_task_id=p_todoist_task_id
  ) then
    return (
      select jsonb_build_object(
        'status','already_mapped','entity_type',entity_type,'entity_id',entity_id,
        'todoist_task_id',todoist_task_id
      )
      from public.todoist_catalog_items
      where user_id=p_user_id and todoist_task_id=p_todoist_task_id
    );
  end if;

  v_routine_id := private.catalog_mutate_routine(
    p_user_id,'create',null,p_title
  );

  insert into public.todoist_catalog_items(
    user_id,entity_type,entity_id,todoist_project_id,todoist_section_id,
    todoist_task_id,last_synced_title,catalog_status
  )
  values(
    p_user_id,'routine',v_routine_id,p_project_id,p_section_id,
    p_todoist_task_id,btrim(p_title),'active'
  );

  perform public.record_scheduler_signal(
    p_user_id,
    'routine_configuration_changed',
    'routines',
    v_routine_id,
    jsonb_build_object(
      'reason','Routine added from Me+ Catalog Todoist configuration surface.',
      'title',btrim(p_title),
      'needs_schedule_configuration',true
    ),
    'catalog:routine:add:'||v_routine_id::text
  );

  return jsonb_build_object(
    'status','created','entity_type','routine','entity_id',v_routine_id,
    'todoist_task_id',p_todoist_task_id
  );
end;
$function$;

create or replace function public.catalog_rename_entity(
  p_user_id uuid,
  p_todoist_task_id text,
  p_new_title text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_map public.todoist_catalog_items%rowtype;
begin
  if nullif(btrim(p_new_title),'') is null then
    raise exception 'new title is required';
  end if;

  select * into v_map
  from public.todoist_catalog_items
  where user_id=p_user_id
    and todoist_task_id=p_todoist_task_id
    and catalog_status='active'
  for update;

  if not found then
    raise exception 'unknown active catalog item %',p_todoist_task_id;
  end if;

  if v_map.entity_type='routine' then
    perform private.catalog_mutate_routine(
      p_user_id,'rename',v_map.entity_id,p_new_title
    );

    perform public.record_scheduler_signal(
      p_user_id,'routine_configuration_changed','routines',v_map.entity_id,
      jsonb_build_object(
        'reason','Routine renamed from Me+ Catalog',
        'title',btrim(p_new_title)
      ),
      'catalog:routine:rename:'||v_map.entity_id::text||':'||md5(btrim(p_new_title))
    );
  else
    update public.actions
    set title=btrim(p_new_title),updated_at=clock_timestamp()
    where user_id=p_user_id and id=v_map.entity_id;

    perform public.record_scheduler_signal(
      p_user_id,'canonical_action_changed','actions',v_map.entity_id,
      jsonb_build_object(
        'reason','Task renamed from Me+ Catalog',
        'title',btrim(p_new_title)
      ),
      'catalog:action:rename:'||v_map.entity_id::text||':'||md5(btrim(p_new_title))
    );
  end if;

  update public.todoist_catalog_items
  set last_synced_title=btrim(p_new_title),updated_at=clock_timestamp()
  where id=v_map.id;

  return jsonb_build_object(
    'status','renamed','entity_type',v_map.entity_type,'entity_id',v_map.entity_id,
    'title',btrim(p_new_title)
  );
end;
$function$;

create or replace function public.catalog_delete_entity(
  p_user_id uuid,
  p_todoist_task_id text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_map public.todoist_catalog_items%rowtype;
begin
  select * into v_map
  from public.todoist_catalog_items
  where user_id=p_user_id
    and todoist_task_id=p_todoist_task_id
    and catalog_status='active'
  for update;

  if not found then
    return jsonb_build_object(
      'status','already_absent','todoist_task_id',p_todoist_task_id
    );
  end if;

  if v_map.entity_type='routine' then
    perform private.catalog_mutate_routine(
      p_user_id,'deactivate',v_map.entity_id,null
    );

    perform public.record_scheduler_signal(
      p_user_id,'routine_configuration_changed','routines',v_map.entity_id,
      jsonb_build_object(
        'reason','Routine deleted from Me+ Catalog; user marked it unnecessary.',
        'active',false
      ),
      'catalog:routine:delete:'||v_map.entity_id::text
    );
  else
    update public.actions
    set status='cancelled',
        constraint_flags=constraint_flags || jsonb_build_object(
          'cancelled_via','todoist_catalog_delete',
          'catalog_deleted_at',clock_timestamp()
        ),
        updated_at=clock_timestamp()
    where user_id=p_user_id
      and id=v_map.entity_id
      and status not in ('completed','cancelled','expired');

    insert into public.action_events(
      user_id,action_id,event_type,occurred_at,reason_code,note,metadata
    )
    select
      p_user_id,v_map.entity_id,'cancelled',clock_timestamp(),
      'todoist_catalog_deleted',
      'User deleted the canonical task from Me+ Catalog, meaning it is unnecessary.',
      jsonb_build_object('todoist_catalog_task_id',p_todoist_task_id)
    where not exists (
      select 1 from public.action_events
      where user_id=p_user_id
        and action_id=v_map.entity_id
        and event_type='cancelled'
        and reason_code='todoist_catalog_deleted'
    );

    perform public.record_scheduler_signal(
      p_user_id,'canonical_action_changed','actions',v_map.entity_id,
      jsonb_build_object(
        'reason','Task deleted from Me+ Catalog; user marked it unnecessary.',
        'status','cancelled'
      ),
      'catalog:action:delete:'||v_map.entity_id::text
    );
  end if;

  update public.todoist_catalog_items
  set catalog_status='deleted',deleted_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=v_map.id;

  return jsonb_build_object(
    'status','deleted','entity_type',v_map.entity_type,'entity_id',v_map.entity_id
  );
end;
$function$;

revoke all on function public.catalog_create_routine_from_todoist(uuid,text,text,text,text)
  from public,anon,authenticated;
revoke all on function public.catalog_rename_entity(uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.catalog_delete_entity(uuid,text)
  from public,anon,authenticated;

grant execute on function public.catalog_create_routine_from_todoist(uuid,text,text,text,text)
  to service_role;
grant execute on function public.catalog_rename_entity(uuid,text,text)
  to service_role;
grant execute on function public.catalog_delete_entity(uuid,text)
  to service_role;
