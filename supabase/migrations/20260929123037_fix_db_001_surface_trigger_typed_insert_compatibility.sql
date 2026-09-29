create or replace function private.sync_action_surface_columns_from_constraint_flags()
returns trigger
language plpgsql
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_insert boolean := tg_op='INSERT';
begin
  if (v_insert and new.constraint_flags ? 'todoist_task_id')
     or (not v_insert and new.constraint_flags->'todoist_task_id'
        is distinct from old.constraint_flags->'todoist_task_id') then
    new.surface_external_id := nullif(new.constraint_flags->>'todoist_task_id','');
    if new.constraint_flags ? 'todoist_task_id' then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if (v_insert and new.constraint_flags ? 'last_todoist_task_id')
     or (not v_insert and new.constraint_flags->'last_todoist_task_id'
        is distinct from old.constraint_flags->'last_todoist_task_id') then
    new.surface_last_external_id := nullif(new.constraint_flags->>'last_todoist_task_id','');
    if new.constraint_flags ? 'last_todoist_task_id' then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if (v_insert and (
        new.constraint_flags ? 'todoist_project_id'
        or new.constraint_flags ? 'todoist_tasks_project_id'
      ))
     or (not v_insert and (
        new.constraint_flags->'todoist_project_id'
          is distinct from old.constraint_flags->'todoist_project_id'
        or new.constraint_flags->'todoist_tasks_project_id'
          is distinct from old.constraint_flags->'todoist_tasks_project_id'
      )) then
    new.surface_project_id := coalesce(
      nullif(new.constraint_flags->>'todoist_project_id',''),
      nullif(new.constraint_flags->>'todoist_tasks_project_id','')
    );
    if new.constraint_flags ? 'todoist_project_id'
       or new.constraint_flags ? 'todoist_tasks_project_id' then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if (v_insert and new.constraint_flags ? 'todoist_parent_task_id')
     or (not v_insert and new.constraint_flags->'todoist_parent_task_id'
        is distinct from old.constraint_flags->'todoist_parent_task_id') then
    new.surface_parent_external_id := nullif(new.constraint_flags->>'todoist_parent_task_id','');
    if new.constraint_flags ? 'todoist_parent_task_id' then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if (v_insert and new.constraint_flags ? 'todoist_bundle_key')
     or (not v_insert and new.constraint_flags->'todoist_bundle_key'
        is distinct from old.constraint_flags->'todoist_bundle_key') then
    new.surface_bundle_key := nullif(new.constraint_flags->>'todoist_bundle_key','');
    if new.constraint_flags ? 'todoist_bundle_key' then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if (v_insert and new.constraint_flags ? 'surface_state')
     or (not v_insert and new.constraint_flags->'surface_state'
        is distinct from old.constraint_flags->'surface_state') then
    new.surface_state := nullif(new.constraint_flags->>'surface_state','');
    if new.constraint_flags ? 'surface_state' and new.surface_provider is null then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if (v_insert and new.constraint_flags ? 'surface_source')
     or (not v_insert and new.constraint_flags->'surface_source'
        is distinct from old.constraint_flags->'surface_source') then
    new.surface_source := nullif(new.constraint_flags->>'surface_source','');
  end if;

  if (v_insert and new.constraint_flags ? 'completion_source')
     or (not v_insert and new.constraint_flags->'completion_source'
        is distinct from old.constraint_flags->'completion_source') then
    new.surface_completion_source := nullif(new.constraint_flags->>'completion_source','');
  end if;

  if (v_insert and new.constraint_flags ? 'surfaced_at')
     or (not v_insert and new.constraint_flags->'surfaced_at'
        is distinct from old.constraint_flags->'surfaced_at') then
    new.surface_surfaced_at := nullif(new.constraint_flags->>'surfaced_at','')::timestamptz;
  end if;

  if (v_insert and new.constraint_flags ? 'todoist_completed_at')
     or (not v_insert and new.constraint_flags->'todoist_completed_at'
        is distinct from old.constraint_flags->'todoist_completed_at') then
    new.surface_completed_at := nullif(new.constraint_flags->>'todoist_completed_at','')::timestamptz;
  end if;

  if (v_insert and new.constraint_flags ? 'surface_removed_at')
     or (not v_insert and new.constraint_flags->'surface_removed_at'
        is distinct from old.constraint_flags->'surface_removed_at') then
    new.surface_removed_at := nullif(new.constraint_flags->>'surface_removed_at','')::timestamptz;
  end if;

  if (v_insert and new.constraint_flags ? 'unsurface_requested_at')
     or (not v_insert and new.constraint_flags->'unsurface_requested_at'
        is distinct from old.constraint_flags->'unsurface_requested_at') then
    new.surface_unsurface_requested_at := nullif(new.constraint_flags->>'unsurface_requested_at','')::timestamptz;
  end if;

  if (v_insert and new.constraint_flags ? 'last_unsurfaced_at')
     or (not v_insert and new.constraint_flags->'last_unsurfaced_at'
        is distinct from old.constraint_flags->'last_unsurfaced_at') then
    new.surface_last_unsurfaced_at := nullif(new.constraint_flags->>'last_unsurfaced_at','')::timestamptz;
  end if;

  if (v_insert and new.constraint_flags ? 'last_todoist_sync_at')
     or (not v_insert and new.constraint_flags->'last_todoist_sync_at'
        is distinct from old.constraint_flags->'last_todoist_sync_at') then
    new.surface_last_sync_at := nullif(new.constraint_flags->>'last_todoist_sync_at','')::timestamptz;
  end if;

  if (v_insert and new.constraint_flags ? 'unsurface_reason')
     or (not v_insert and new.constraint_flags->'unsurface_reason'
        is distinct from old.constraint_flags->'unsurface_reason') then
    new.surface_unsurface_reason := nullif(new.constraint_flags->>'unsurface_reason','');
  end if;

  if (v_insert and new.constraint_flags ? 'scheduler_controls_surface')
     or (not v_insert and new.constraint_flags->'scheduler_controls_surface'
        is distinct from old.constraint_flags->'scheduler_controls_surface') then
    new.surface_scheduler_controls := coalesce(
      nullif(new.constraint_flags->>'scheduler_controls_surface','')::boolean,
      false
    );
    if new.constraint_flags ? 'scheduler_controls_surface' and new.surface_provider is null then
      new.surface_provider := 'todoist';
    end if;
  end if;

  if (v_insert and new.constraint_flags ? 'must_remain_open_until_complete')
     or (not v_insert and new.constraint_flags->'must_remain_open_until_complete'
        is distinct from old.constraint_flags->'must_remain_open_until_complete') then
    new.surface_must_remain_open := coalesce(
      nullif(new.constraint_flags->>'must_remain_open_until_complete','')::boolean,
      false
    );
  end if;

  if (v_insert and new.constraint_flags ? 'continuous_surface_required')
     or (not v_insert and new.constraint_flags->'continuous_surface_required'
        is distinct from old.constraint_flags->'continuous_surface_required') then
    new.surface_continuous_required := coalesce(
      nullif(new.constraint_flags->>'continuous_surface_required','')::boolean,
      false
    );
  end if;

  if (v_insert and new.constraint_flags ? 'surface_policy')
     or (not v_insert and new.constraint_flags->'surface_policy'
        is distinct from old.constraint_flags->'surface_policy') then
    new.surface_policy := nullif(new.constraint_flags->>'surface_policy','');
  end if;

  if (v_insert and new.constraint_flags ? 'user_surface_directive')
     or (not v_insert and new.constraint_flags->'user_surface_directive'
        is distinct from old.constraint_flags->'user_surface_directive') then
    new.surface_user_directive := nullif(new.constraint_flags->>'user_surface_directive','');
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_action_surface_columns_from_constraint_flags()
  from public, anon, authenticated;
