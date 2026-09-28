
create or replace function public.learn_todoist_bundle_subtask(
  p_user_id uuid,
  p_bundle_key text,
  p_child_title text,
  p_child_order integer,
  p_external_task_id text,
  p_parent_external_task_id text,
  p_occurrence_date date,
  p_scheduler_run_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_bundle public.routine_bundles%rowtype;
  v_step public.routine_bundle_steps%rowtype;
  v_routine public.routines%rowtype;
  v_schedule_id uuid;
  v_materialized jsonb;
  v_action_id uuid;
begin
  if nullif(btrim(p_child_title),'') is null then
    raise exception 'child title is required';
  end if;

  select * into v_bundle
  from public.routine_bundles
  where user_id=p_user_id and bundle_key=p_bundle_key and active
  for update;

  if not found then
    raise exception 'unknown active bundle %',p_bundle_key;
  end if;

  select * into v_step
  from public.routine_bundle_steps
  where user_id=p_user_id
    and bundle_id=v_bundle.id
    and lower(child_title)=lower(btrim(p_child_title))
    and active
  limit 1;

  if found then
    update public.routine_bundle_steps
    set child_order=greatest(coalesce(p_child_order,child_order),1),
        learned_from_external_task_id=coalesce(p_external_task_id,learned_from_external_task_id),
        learned_from_parent_external_task_id=coalesce(p_parent_external_task_id,learned_from_parent_external_task_id),
        updated_at=now()
    where id=v_step.id;

    select * into v_routine
    from public.routines
    where id=v_step.routine_id and user_id=p_user_id;
  else
    select * into v_routine
    from public.routines
    where user_id=p_user_id
      and active
      and domain=v_bundle.domain
      and lower(title)=lower(btrim(p_child_title))
    order by updated_at desc
    limit 1;

    if not found then
      insert into public.routines(
        user_id,domain,title,instructions,importance,normal_duration_minutes,
        normal_definition,notification_policy,active
      )
      values(
        p_user_id,
        v_bundle.domain,
        btrim(p_child_title),
        'User-added Todoist subtask learned from '||v_bundle.parent_title||'.',
        v_bundle.default_importance,
        v_bundle.default_duration_minutes,
        jsonb_build_object(
          'source','todoist_user_subtask',
          'action_type','routine_step',
          'cadence_hint','daily',
          'preferred_window',v_bundle.preferred_window,
          'configuration_status','enabled_user_authored',
          'learned_from_bundle',v_bundle.bundle_key
        ),
        jsonb_build_object(
          'surface','todoist',
          'creation','hourly_action_engine_only',
          'reminders',false,
          'todoist_bundle',jsonb_build_object(
            'group_key',v_bundle.bundle_key,
            'parent_title',v_bundle.parent_title,
            'child_title',btrim(p_child_title),
            'child_order',greatest(coalesce(p_child_order,1),1),
            'mode','parent_with_subtasks',
            'include_when_due',true,
            'source','todoist_user',
            'persistent',true
          )
        ),
        true
      )
      returning * into v_routine;
    end if;

    select id into v_schedule_id
    from public.routine_schedules
    where user_id=p_user_id
      and routine_id=v_routine.id
      and schedule_type='daily'
      and (ends_on is null or ends_on>=p_occurrence_date)
    order by created_at desc
    limit 1;

    if v_schedule_id is null then
      insert into public.routine_schedules(
        user_id,routine_id,schedule_type,local_time,timezone,
        window_start_local,window_end_local,schedule_config,starts_on
      )
      values(
        p_user_id,v_routine.id,'daily',
        nullif(v_bundle.schedule_template->>'local_time','')::time,
        coalesce(v_bundle.schedule_template->>'timezone','Europe/Berlin'),
        nullif(v_bundle.schedule_template->>'window_start_local','')::time,
        nullif(v_bundle.schedule_template->>'window_end_local','')::time,
        coalesce(v_bundle.schedule_template->'schedule_config','{}'::jsonb)
          || jsonb_build_object(
            'bundle',v_bundle.bundle_key,
            'source','todoist_user_subtask',
            'child_order',greatest(coalesce(p_child_order,1),1)
          ),
        p_occurrence_date
      )
      returning id into v_schedule_id;
    end if;

    insert into public.routine_bundle_steps(
      user_id,bundle_id,routine_id,child_title,child_order,active,source,
      learned_from_external_task_id,learned_from_parent_external_task_id
    )
    values(
      p_user_id,v_bundle.id,v_routine.id,btrim(p_child_title),
      greatest(coalesce(p_child_order,1),1),true,'todoist_user',
      p_external_task_id,p_parent_external_task_id
    )
    returning * into v_step;
  end if;

  if v_schedule_id is null then
    select id into v_schedule_id
    from public.routine_schedules
    where user_id=p_user_id
      and routine_id=v_routine.id
      and schedule_type='daily'
      and (ends_on is null or ends_on>=p_occurrence_date)
    order by created_at desc
    limit 1;
  end if;

  v_materialized := public.scheduler_materialize_routine_action(
    p_user_id,v_routine.id,v_schedule_id,p_occurrence_date,p_scheduler_run_id
  );
  v_action_id := (v_materialized->>'action_id')::uuid;

  update public.actions
  set constraint_flags=constraint_flags || jsonb_build_object(
        'todoist_task_id',p_external_task_id,
        'todoist_parent_task_id',p_parent_external_task_id,
        'todoist_bundle_key',v_bundle.bundle_key,
        'todoist_project_id','6hfCX2v7QM36VMcH',
        'todoist_tasks_project_id','6hfCX2v7QM36VMcH',
        'surface_state','surfaced',
        'surface_source','user_added_todoist_subtask',
        'surfaced_at',now(),
        'scheduler_run_id',p_scheduler_run_id
      ),
      updated_at=now()
  where id=v_action_id and user_id=p_user_id;

  insert into public.action_events(
    user_id,action_id,event_type,occurred_at,reason_code,note,metadata
  )
  select
    p_user_id,v_action_id,'surfaced',now(),
    'user_added_todoist_subtask_learned',
    'User-added Todoist child was promoted into persistent Me+ bundle configuration.',
    jsonb_build_object(
      'bundle_key',v_bundle.bundle_key,
      'todoist_task_id',p_external_task_id,
      'todoist_parent_task_id',p_parent_external_task_id,
      'scheduler_run_id',p_scheduler_run_id
    )
  where not exists (
    select 1 from public.action_events
    where user_id=p_user_id
      and action_id=v_action_id
      and event_type='surfaced'
      and metadata->>'todoist_task_id'=p_external_task_id
  );

  return jsonb_build_object(
    'bundle_key',v_bundle.bundle_key,
    'bundle_id',v_bundle.id,
    'bundle_step_id',v_step.id,
    'routine_id',v_routine.id,
    'schedule_id',v_schedule_id,
    'action_id',v_action_id,
    'child_title',btrim(p_child_title),
    'persistent',true,
    'learned_from_todoist',true
  );
end;
$$;

revoke all on function public.learn_todoist_bundle_subtask(uuid,text,text,integer,text,text,date,uuid)
from public,anon,authenticated;
grant execute on function public.learn_todoist_bundle_subtask(uuid,text,text,integer,text,text,date,uuid)
to service_role;
