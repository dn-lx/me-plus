
create or replace function public.me_scheduler_probe(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
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
begin
  select coalesce(timezone,'Europe/Berlin')
  into v_tz
  from public.profiles
  where id = p_user_id;

  if v_tz is null then
    raise exception 'Unknown profile %', p_user_id;
  end if;

  v_local_ts := p_now at time zone v_tz;
  v_local_date := v_local_ts::date;
  v_local_time := v_local_ts::time;

  select
    nullif(value->>'last_deep_run_at','')::timestamptz,
    nullif(value->>'last_external_refresh_at','')::timestamptz,
    coalesce((value->>'external_refresh_interval_hours')::integer,4)
  into v_last_deep, v_last_external, v_external_interval_hours
  from public.preferences
  where user_id=p_user_id
    and key='scheduler_runtime_state'
    and scope='action_engine'
  limit 1;

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
        and not (key='scheduler_runtime_state' and scope='action_engine')
  ) changes;

  v_state_changed :=
    v_last_deep is null
    or (v_latest_state_change is not null and v_latest_state_change > v_last_deep);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'routine_id', routine_id,
      'schedule_id', schedule_id,
      'title', title,
      'domain', domain,
      'importance', importance,
      'duration_minutes', duration_minutes,
      'window_start_local', window_start_local,
      'window_end_local', window_end_local,
      'bundle', bundle_name,
      'window_opened_at', window_opened_at
    )
    order by importance desc, title
  ), '[]'::jsonb)
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
      ((v_local_date + rs.window_start_local) at time zone v_tz) as window_opened_at
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
      )
      and not exists (
        select 1
        from public.routine_events re
        where re.user_id=p_user_id
          and re.routine_id=r.id
          and re.occurrence_date=v_local_date
      )
  ) due;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'action_id', id,
      'title', title,
      'domain', domain,
      'priority', priority,
      'due_at', due_at,
      'reason', reason
    )
    order by due_at nulls last, priority, title
  ), '[]'::jsonb)
  into v_due_actions
  from public.actions
  where user_id=p_user_id
    and status in ('proposed','planned','available','in_progress','partial')
    and due_at is not null
    and due_at <= p_now
    and (v_last_deep is null or due_at > v_last_deep);

  v_pending_signals := public.get_pending_scheduler_signals(p_user_id,20);

  v_external_refresh_due :=
    v_local_time >= '07:00'::time
    and v_local_time <= '23:59:59'::time
    and (
      v_last_external is null
      or p_now >= v_last_external + make_interval(hours => v_external_interval_hours)
    );

  if jsonb_array_length(v_due_routines) > 0 then
    v_reasons := v_reasons || jsonb_build_array('new_due_routine_window');
  end if;
  if jsonb_array_length(v_due_actions) > 0 then
    v_reasons := v_reasons || jsonb_build_array('newly_overdue_action');
  end if;
  if jsonb_array_length(v_pending_signals) > 0 then
    v_reasons := v_reasons || jsonb_build_array('pending_scheduler_signal');
  end if;
  if v_state_changed then
    v_reasons := v_reasons || jsonb_build_array('canonical_state_changed');
  end if;
  if v_external_refresh_due then
    v_reasons := v_reasons || jsonb_build_array('periodic_external_refresh');
  end if;

  v_needs_ai := jsonb_array_length(v_reasons) > 0;

  return jsonb_build_object(
    'gate_version','v2',
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
$$;

revoke all on function public.me_scheduler_probe(uuid,timestamptz)
from public, anon, authenticated;
grant execute on function public.me_scheduler_probe(uuid,timestamptz)
to service_role;

create or replace function public.mark_scheduler_signals_processed(
  p_user_id uuid,
  p_signal_ids uuid[],
  p_note text default null
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.scheduler_signals
  set status='processed',
      processed_at=now(),
      processing_note=coalesce(p_note,processing_note)
  where user_id=p_user_id
    and id=any(p_signal_ids)
    and status in ('new','claimed');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_scheduler_signals_processed(uuid,uuid[],text)
from public, anon, authenticated;
grant execute on function public.mark_scheduler_signals_processed(uuid,uuid[],text)
to service_role;

comment on function public.me_scheduler_probe(uuid,timestamptz) is
'Deterministic Task schduler preflight v2. Includes due windows, newly overdue actions, canonical state changes, pending scheduler signals and external refresh cadence.';
