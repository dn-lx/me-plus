begin;

select set_config(
  'app.catalog_test_user',
  (select id::text from public.profiles order by created_at limit 1),
  true
);

set local role service_role;

do $test$
declare
  u uuid := current_setting('app.catalog_test_user')::uuid;
  task_id text := '__sch041_catalog_routine_acceptance__';
  c jsonb;
  rn jsonb;
  d jsonb;
begin
  if u is null then raise exception 'catalog acceptance user fixture missing'; end if;

  c := public.catalog_create_routine_from_todoist(
    u,'__SCH041 Routine__',task_id,'__sch041_project__','__sch041_section__'
  );
  if c->>'status' <> 'created' or c->>'entity_type' <> 'routine' then
    raise exception 'catalog routine create failed: %',c;
  end if;

  if public.catalog_create_routine_from_todoist(
    u,'__SCH041 Routine__',task_id,'__sch041_project__','__sch041_section__'
  )->>'status' <> 'already_mapped' then
    raise exception 'catalog routine create idempotency failed';
  end if;

  rn := public.catalog_rename_entity(u,task_id,'__SCH041 Routine Renamed__');
  if rn->>'status' <> 'renamed' or rn->>'title' <> '__SCH041 Routine Renamed__' then
    raise exception 'catalog routine rename failed: %',rn;
  end if;

  d := public.catalog_delete_entity(u,task_id);
  if d->>'status' <> 'deleted' or d->>'entity_type' <> 'routine' then
    raise exception 'catalog routine delete failed: %',d;
  end if;

  if public.catalog_delete_entity(u,task_id)->>'status' <> 'already_absent' then
    raise exception 'catalog routine delete idempotency failed';
  end if;
end
$test$;

reset role;

do $verify$
declare
  v_id uuid;
  v_title text;
  v_active boolean;
  v_catalog_status text;
begin
  select entity_id,catalog_status
  into v_id,v_catalog_status
  from public.todoist_catalog_items
  where todoist_task_id='__sch041_catalog_routine_acceptance__';

  if v_id is null or v_catalog_status <> 'deleted' then
    raise exception 'catalog mapping terminal state invalid';
  end if;

  select title,active into v_title,v_active
  from public.routines
  where id=v_id;

  if v_title <> '__SCH041 Routine Renamed__' or v_active then
    raise exception 'catalog routine canonical state invalid';
  end if;

  if has_function_privilege(
       'authenticated','private.catalog_mutate_routine(uuid,text,uuid,text)','EXECUTE'
     )
     or has_function_privilege(
       'anon','private.catalog_mutate_routine(uuid,text,uuid,text)','EXECUTE'
     ) then
    raise exception 'private catalog routine mutation boundary exposed to client roles';
  end if;

  if has_function_privilege(
       'authenticated','public.catalog_create_routine_from_todoist(uuid,text,text,text,text)','EXECUTE'
     )
     or has_function_privilege(
       'anon','public.catalog_create_routine_from_todoist(uuid,text,text,text,text)','EXECUTE'
     ) then
    raise exception 'public catalog routine helper exposed to client roles';
  end if;
end
$verify$;

rollback;

select 'PASS: SCH-041 catalog routine create/rename/delete/idempotency/denied-role acceptance' as result;
