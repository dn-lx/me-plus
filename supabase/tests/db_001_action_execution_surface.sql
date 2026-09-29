begin;

do $test$
declare
  v_user uuid;
  v_legacy uuid;
  v_typed uuid;
  v_key_removal uuid;
  v_unique_one uuid;
  v_expected_error boolean;
begin
  select id into v_user from public.profiles order by created_at limit 1;
  if v_user is null then
    raise exception 'DB-001 test requires an existing profile';
  end if;

  insert into public.actions(
    user_id,domain,origin,title,priority,version,status,constraint_flags
  ) values (
    v_user,'test','system','DB-001 regression legacy JSON insert',
    'bonus','minimum','planned',
    jsonb_build_object(
      'todoist_task_id','db001-regression-legacy',
      'todoist_project_id','db001-project',
      'surface_state','pending',
      'scheduler_controls_surface',true,
      'must_remain_open_until_complete',true,
      'continuous_surface_required',false
    )
  ) returning id into v_legacy;

  if not exists (
    select 1 from public.actions
    where id=v_legacy
      and surface_provider='todoist'
      and surface_external_id='db001-regression-legacy'
      and surface_project_id='db001-project'
      and surface_state='pending'
      and surface_scheduler_controls
      and surface_must_remain_open
      and not surface_continuous_required
  ) then
    raise exception 'legacy JSON insert did not populate typed surface state';
  end if;

  perform public.scheduler_record_todoist_surface_result(
    v_legacy,'update','db001-regression-legacy','db001-project'
  );

  if not exists (
    select 1 from public.actions
    where id=v_legacy
      and surface_provider='todoist'
      and surface_external_id='db001-regression-legacy'
      and surface_state='surfaced'
      and surface_surfaced_at is not null
      and surface_last_sync_at is not null
  ) then
    raise exception 'surface result did not write typed surfaced state';
  end if;

  v_expected_error := false;
  begin
    perform public.scheduler_apply_todoist_completion(
      v_user,v_legacy,clock_timestamp(),'db001-wrong-task'
    );
  exception when others then
    if sqlerrm like 'Todoist task mismatch for action %' then
      v_expected_error := true;
    else
      raise;
    end if;
  end;
  if not v_expected_error then
    raise exception 'mismatched Todoist completion was not rejected';
  end if;

  perform public.scheduler_apply_todoist_completion(
    v_user,v_legacy,clock_timestamp(),'db001-regression-legacy'
  );

  if not exists (
    select 1 from public.actions
    where id=v_legacy
      and status='completed'
      and surface_state='completed'
      and surface_completion_source='todoist'
      and surface_completed_at is not null
      and constraint_flags->>'surface_state'='completed'
      and constraint_flags->>'completion_source'='todoist'
  ) then
    raise exception 'Todoist completion did not update typed completion state';
  end if;

  insert into public.actions(
    user_id,domain,origin,title,priority,version,status,constraint_flags,
    surface_provider,surface_external_id,surface_project_id,surface_state,
    surface_scheduler_controls,surface_must_remain_open,surface_continuous_required
  ) values (
    v_user,'test','system','DB-001 regression typed insert',
    'bonus','minimum','planned','{}'::jsonb,
    'todoist','db001-regression-typed','db001-project','pending',
    true,true,true
  ) returning id into v_typed;

  if not exists (
    select 1 from public.actions
    where id=v_typed
      and surface_provider='todoist'
      and surface_external_id='db001-regression-typed'
      and surface_project_id='db001-project'
      and surface_state='pending'
      and surface_scheduler_controls
      and surface_must_remain_open
      and surface_continuous_required
  ) then
    raise exception 'typed-first insert was overwritten by compatibility trigger';
  end if;

  perform public.scheduler_record_todoist_surface_result(
    v_typed,'create','db001-regression-typed','db001-project'
  );
  perform public.scheduler_record_todoist_surface_result(
    v_typed,'remove','db001-regression-typed','db001-project'
  );

  if not exists (
    select 1 from public.actions
    where id=v_typed
      and surface_provider='todoist'
      and surface_external_id is null
      and surface_last_external_id='db001-regression-typed'
      and surface_state='unsurfaced'
      and surface_removed_at is not null
      and surface_last_unsurfaced_at is not null
      and surface_last_sync_at is not null
      and not (constraint_flags ? 'todoist_task_id')
      and constraint_flags->>'last_todoist_task_id'='db001-regression-typed'
  ) then
    raise exception 'surface removal did not preserve typed/history semantics';
  end if;

  insert into public.actions(
    user_id,domain,origin,title,priority,version,status,constraint_flags
  ) values (
    v_user,'test','system','DB-001 regression legacy key removal',
    'bonus','minimum','planned',
    jsonb_build_object(
      'todoist_task_id','db001-regression-key-removal',
      'surface_state','pending'
    )
  ) returning id into v_key_removal;

  update public.actions
  set constraint_flags=constraint_flags - 'todoist_task_id'
  where id=v_key_removal;

  if exists (
    select 1 from public.actions
    where id=v_key_removal and surface_external_id is not null
  ) then
    raise exception 'legacy JSON key removal did not clear typed external id';
  end if;

  insert into public.actions(
    user_id,domain,origin,title,priority,version,status,
    surface_provider,surface_external_id,surface_state
  ) values (
    v_user,'test','system','DB-001 regression unique one',
    'bonus','minimum','planned','todoist','db001-regression-unique','pending'
  ) returning id into v_unique_one;

  v_expected_error := false;
  begin
    insert into public.actions(
      user_id,domain,origin,title,priority,version,status,
      surface_provider,surface_external_id,surface_state
    ) values (
      v_user,'test','system','DB-001 regression unique duplicate',
      'bonus','minimum','planned','todoist','db001-regression-unique','pending'
    );
  exception when unique_violation then
    v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'duplicate typed surface external id was not rejected';
  end if;

  v_expected_error := false;
  begin
    update public.actions
    set surface_state='not_a_valid_surface_state'
    where id=v_unique_one;
  exception when check_violation then
    v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'invalid typed surface state was not rejected';
  end if;
end
$test$;

rollback;

select 'passed' as db_001_transactional_regression;
