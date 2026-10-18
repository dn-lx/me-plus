
create or replace function public.scheduler_apply_todoist_completion(
  p_user_id uuid,
  p_action_id uuid,
  p_completed_at timestamptz,
  p_todoist_task_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
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

  if coalesce(v_action.constraint_flags->>'todoist_task_id','') <> p_todoist_task_id then
    raise exception 'Todoist task mismatch for action %',p_action_id;
  end if;

  if v_action.status='completed' then
    return jsonb_build_object(
      'action_id',p_action_id,
      'status','already_completed',
      'completed_at',p_completed_at
    );
  end if;

  update public.actions
  set status='completed',
      constraint_flags=constraint_flags || jsonb_build_object(
        'todoist_completed_at',p_completed_at,
        'completion_source','todoist'
      ),
      updated_at=now()
  where id=p_action_id and user_id=p_user_id;

  if v_action.routine_event_id is not null then
    update public.routine_events
    set status='completed',
        completed_at=p_completed_at,
        updated_at=now()
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
    'completed_at',p_completed_at
  );
end;
$$;

create or replace function public.scheduler_materialize_routine_action(
  p_user_id uuid,
  p_routine_id uuid,
  p_schedule_id uuid,
  p_occurrence_date date,
  p_scheduler_run_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_routine public.routines%rowtype;
  v_schedule public.routine_schedules%rowtype;
  v_event_id uuid;
  v_action_id uuid;
  v_tz text;
  v_scheduled_for timestamptz;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_priority text;
begin
  select * into v_routine
  from public.routines
  where id=p_routine_id and user_id=p_user_id and active;

  if not found then
    raise exception 'Unknown/inactive routine % for user %',p_routine_id,p_user_id;
  end if;

  select * into v_schedule
  from public.routine_schedules
  where id=p_schedule_id and user_id=p_user_id and routine_id=p_routine_id;

  if not found then
    raise exception 'Unknown schedule % for routine %',p_schedule_id,p_routine_id;
  end if;

  v_tz := coalesce(v_schedule.timezone,'Europe/Berlin');
  v_scheduled_for := ((p_occurrence_date + v_schedule.local_time) at time zone v_tz);
  v_window_start := ((p_occurrence_date + v_schedule.window_start_local) at time zone v_tz);
  v_window_end := ((p_occurrence_date + v_schedule.window_end_local) at time zone v_tz);

  insert into public.routine_events(
    user_id,routine_id,scheduled_for,window_start,window_end,status,
    selected_version,routine_schedule_id,occurrence_date
  )
  values(
    p_user_id,p_routine_id,v_scheduled_for,v_window_start,v_window_end,'due',
    'full',p_schedule_id,p_occurrence_date
  )
  on conflict (user_id,routine_schedule_id,occurrence_date)
    where routine_schedule_id is not null and occurrence_date is not null
  do update set updated_at=public.routine_events.updated_at
  returning id into v_event_id;

  select id into v_action_id
  from public.actions
  where user_id=p_user_id and routine_event_id=v_event_id
  order by created_at
  limit 1;

  if v_action_id is null then
    v_priority := case
      when v_routine.importance >= 5 then 'must'
      when v_routine.importance >= 3 then 'should'
      else 'bonus'
    end;

    insert into public.actions(
      user_id,origin,title,instructions,domain,priority,
      available_from,due_at,estimated_minutes,version,status,
      routine_event_id,reason,constraint_flags
    )
    values(
      p_user_id,'routine',v_routine.title,v_routine.instructions,v_routine.domain,v_priority,
      v_window_start,v_window_end,v_routine.normal_duration_minutes,'full','planned',
      v_event_id,
      'Due configured routine materialized by the Hourly task scheduler.',
      jsonb_build_object(
        'routine_id',p_routine_id,
        'routine_schedule_id',p_schedule_id,
        'occurrence_date',p_occurrence_date,
        'scheduler_run_id',p_scheduler_run_id
      )
    )
    returning id into v_action_id;
  end if;

  return jsonb_build_object(
    'routine_event_id',v_event_id,
    'action_id',v_action_id,
    'routine_id',p_routine_id,
    'schedule_id',p_schedule_id,
    'occurrence_date',p_occurrence_date
  );
end;
$$;

revoke all on function public.scheduler_apply_todoist_completion(uuid,uuid,timestamptz,text)
from public,anon,authenticated;
revoke all on function public.scheduler_materialize_routine_action(uuid,uuid,uuid,date,uuid)
from public,anon,authenticated;

grant execute on function public.scheduler_apply_todoist_completion(uuid,uuid,timestamptz,text)
to service_role;
grant execute on function public.scheduler_materialize_routine_action(uuid,uuid,uuid,date,uuid)
to service_role;

comment on function public.scheduler_apply_todoist_completion(uuid,uuid,timestamptz,text) is
'Deterministically reconciles a linked Todoist completion into canonical action/routine-event state.';
comment on function public.scheduler_materialize_routine_action(uuid,uuid,uuid,date,uuid) is
'Idempotently materializes a due configured routine occurrence and its canonical action for scheduler execution.';
