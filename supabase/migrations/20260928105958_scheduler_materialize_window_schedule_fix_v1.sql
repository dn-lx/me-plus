
create or replace function public.scheduler_materialize_routine_action(
  p_user_id uuid,
  p_routine_id uuid,
  p_schedule_id uuid,
  p_occurrence_date date,
  p_scheduler_run_id uuid
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
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

  v_window_start := case
    when v_schedule.window_start_local is not null
      then ((p_occurrence_date + v_schedule.window_start_local) at time zone v_tz)
    when v_schedule.local_time is not null
      then ((p_occurrence_date + v_schedule.local_time) at time zone v_tz)
    else (p_occurrence_date::timestamp at time zone v_tz)
  end;

  v_window_end := case
    when v_schedule.window_end_local is not null
      then ((p_occurrence_date + v_schedule.window_end_local) at time zone v_tz)
    when v_schedule.local_time is not null
      then ((p_occurrence_date + v_schedule.local_time) at time zone v_tz)
    else ((p_occurrence_date + 1)::timestamp at time zone v_tz)
  end;

  v_scheduled_for := case
    when v_schedule.local_time is not null
      then ((p_occurrence_date + v_schedule.local_time) at time zone v_tz)
    else v_window_start
  end;

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
    'occurrence_date',p_occurrence_date,
    'scheduled_for',v_scheduled_for,
    'window_start',v_window_start,
    'window_end',v_window_end
  );
end;
$function$;
