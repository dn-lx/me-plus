
create or replace function public.record_scheduler_heartbeat(
  p_user_id uuid,
  p_scheduler_key text,
  p_status text,
  p_policy_version text default null,
  p_error jsonb default null,
  p_expected_cadence_minutes integer default null,
  p_allowed_lateness_minutes integer default null,
  p_run_id uuid default null,
  p_automation_id text default null
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_status not in ('invoked','no_op','started','completed','failed','skipped_overlap') then
    raise exception 'invalid scheduler heartbeat status: %', p_status;
  end if;

  insert into public.scheduler_heartbeats(
    user_id,scheduler_key,automation_id,expected_cadence_minutes,allowed_lateness_minutes,
    last_invoked_at,last_succeeded_at,last_failed_at,last_status,last_error,last_policy_version,
    current_run_id,updated_at
  )
  values(
    p_user_id,p_scheduler_key,p_automation_id,p_expected_cadence_minutes,coalesce(p_allowed_lateness_minutes,15),
    case when p_status='invoked' then v_now else null end,
    case when p_status in ('no_op','completed','skipped_overlap') then v_now else null end,
    case when p_status='failed' then v_now else null end,
    p_status,p_error,p_policy_version,
    case when p_status='started' then p_run_id else null end,
    v_now
  )
  on conflict (user_id,scheduler_key) do update
  set automation_id = coalesce(excluded.automation_id, scheduler_heartbeats.automation_id),
      expected_cadence_minutes = coalesce(excluded.expected_cadence_minutes, scheduler_heartbeats.expected_cadence_minutes),
      allowed_lateness_minutes = coalesce(p_allowed_lateness_minutes, scheduler_heartbeats.allowed_lateness_minutes),
      last_invoked_at = case
        when p_status='invoked' then v_now
        else scheduler_heartbeats.last_invoked_at
      end,
      last_succeeded_at = case
        when p_status in ('no_op','completed','skipped_overlap') then v_now
        else scheduler_heartbeats.last_succeeded_at
      end,
      last_failed_at = case
        when p_status='failed' then v_now
        else scheduler_heartbeats.last_failed_at
      end,
      last_status = p_status,
      last_error = case when p_status='failed' then p_error else null end,
      last_policy_version = coalesce(p_policy_version, scheduler_heartbeats.last_policy_version),
      current_run_id = case when p_status='started' then p_run_id else null end,
      updated_at = v_now;

  return jsonb_build_object(
    'scheduler_key',p_scheduler_key,
    'status',p_status,
    'recorded_at',v_now,
    'current_run_id',case when p_status='started' then p_run_id else null end
  );
end;
$function$;

create or replace function public.finish_scheduler_run(
  p_user_id uuid,
  p_run_id uuid,
  p_status text,
  p_sources_checked jsonb default '[]'::jsonb,
  p_changes_made jsonb default '[]'::jsonb,
  p_error jsonb default null
)
returns boolean
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_existing_status text;
begin
  if p_status not in ('completed','failed','no_op') then
    raise exception 'invalid scheduler run finish status: %', p_status;
  end if;

  update public.scheduler_run_log
  set finished_at=clock_timestamp(),
      status=p_status,
      sources_checked=coalesce(p_sources_checked,'[]'::jsonb),
      changes_made=coalesce(p_changes_made,'[]'::jsonb),
      error=p_error
  where id=p_run_id
    and user_id=p_user_id
    and status='started';

  if found then
    return true;
  end if;

  select status
  into v_existing_status
  from public.scheduler_run_log
  where id=p_run_id and user_id=p_user_id;

  -- Idempotent retry after a response loss: the same terminal status is already committed.
  return v_existing_status = p_status;
end;
$function$;

create or replace function public.start_hourly_scheduler_run(
  p_user_id uuid,
  p_automation_id text,
  p_logical_hour timestamptz,
  p_trigger_mode text default 'scheduled'
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_recovery jsonb;
  v_probe jsonb;
  v_policy jsonb;
  v_version text;
  v_run_id uuid;
  v_signal_ids jsonb := '[]'::jsonb;
  v_idempotency_key text;
  v_lease boolean;
  v_logical_hour timestamptz;
  v_existing_status text;
  v_offset_minutes numeric;
  v_error jsonb;
begin
  -- Durable proof-of-invocation is deliberately outside the guarded subtransaction.
  perform public.record_scheduler_heartbeat(
    p_user_id,'hourly_task_scheduler','invoked',null,null,60,15,null,p_automation_id
  );

  begin
    if p_trigger_mode not in ('scheduled','signal','manual','backstop') then
      v_error := jsonb_build_object(
        'error_type','invalid_trigger_mode',
        'trigger_mode',p_trigger_mode
      );
      perform public.record_scheduler_heartbeat(
        p_user_id,'hourly_task_scheduler','failed',null,v_error,60,15,null,p_automation_id
      );
      return jsonb_build_object('status','failed','error',v_error);
    end if;

    v_logical_hour := (
      date_trunc(
        'hour',
        (p_logical_hour at time zone 'Europe/Berlin') + interval '30 minutes'
      ) at time zone 'Europe/Berlin'
    );

    v_offset_minutes := abs(extract(epoch from (p_logical_hour - v_logical_hour))) / 60.0;

    if v_offset_minutes > 15 then
      v_error := jsonb_build_object(
        'error_type','invocation_outside_tolerance',
        'observed_at',p_logical_hour,
        'nearest_logical_hour',v_logical_hour,
        'offset_minutes',round(v_offset_minutes,2),
        'allowed_lateness_minutes',15
      );
      perform public.record_scheduler_heartbeat(
        p_user_id,'hourly_task_scheduler','failed',null,v_error,60,15,null,p_automation_id
      );
      return jsonb_build_object(
        'status','failed',
        'logical_hour',v_logical_hour,
        'error',v_error
      );
    end if;

    v_recovery := public.recover_stale_scheduler_runs(
      p_user_id,'hourly_task_scheduler',clock_timestamp()
    );

    v_probe := public.me_scheduler_probe(p_user_id,v_logical_hour);

    if coalesce((v_probe->>'needs_ai')::boolean,false)=false then
      perform public.record_scheduler_heartbeat(
        p_user_id,'hourly_task_scheduler','no_op',null,null,60,15,null,p_automation_id
      );
      return jsonb_build_object(
        'status','no_op',
        'logical_hour',v_logical_hour,
        'probe',v_probe,
        'recovery',v_recovery
      );
    end if;

    v_policy := public.get_scheduler_policy(p_user_id,'hourly_task_scheduler');

    if v_policy->'global' is null or v_policy->'scheduler' is null then
      v_error := jsonb_build_object('error_type','missing_scheduler_policy');
      perform public.record_scheduler_heartbeat(
        p_user_id,'hourly_task_scheduler','failed',null,v_error,60,15,null,p_automation_id
      );
      return jsonb_build_object(
        'status','failed',
        'logical_hour',v_logical_hour,
        'probe',v_probe,
        'recovery',v_recovery,
        'error',v_error
      );
    end if;

    if coalesce((v_policy->'global'->>'checksum_valid')::boolean,false)=false
       or coalesce((v_policy->'scheduler'->>'checksum_valid')::boolean,false)=false
       or coalesce((v_policy->'global'->>'policy_schema_version')::integer,0)<>2
       or coalesce((v_policy->'scheduler'->>'policy_schema_version')::integer,0)<>2 then
      v_error := jsonb_build_object(
        'error_type','scheduler_policy_integrity_or_schema_invalid',
        'global_checksum_valid',coalesce((v_policy->'global'->>'checksum_valid')::boolean,false),
        'scheduler_checksum_valid',coalesce((v_policy->'scheduler'->>'checksum_valid')::boolean,false),
        'global_schema_version',coalesce((v_policy->'global'->>'policy_schema_version')::integer,0),
        'scheduler_schema_version',coalesce((v_policy->'scheduler'->>'policy_schema_version')::integer,0)
      );
      perform public.record_scheduler_heartbeat(
        p_user_id,'hourly_task_scheduler','failed',null,v_error,60,15,null,p_automation_id
      );
      return jsonb_build_object(
        'status','failed',
        'logical_hour',v_logical_hour,
        'probe',v_probe,
        'policy',v_policy,
        'recovery',v_recovery,
        'error',v_error
      );
    end if;

    v_version := v_policy->'scheduler'->>'policy_version';

    select coalesce(jsonb_agg((x->>'id')::uuid),'[]'::jsonb)
    into v_signal_ids
    from jsonb_array_elements(coalesce(v_probe->'pending_scheduler_signals','[]'::jsonb)) x;

    v_idempotency_key :=
      'hourly_task_scheduler:' ||
      to_char(v_logical_hour at time zone 'Europe/Berlin','YYYY-MM-DD"T"HH24:00') ||
      ':Europe/Berlin:' || v_version;

    v_run_id := public.begin_scheduler_run(
      p_user_id,'hourly_task_scheduler','Hourly task scheduler',
      p_trigger_mode,v_probe->>'gate_version',true,
      v_probe->'reasons',v_signal_ids,v_version,v_idempotency_key
    );

    select status into v_existing_status
    from public.scheduler_run_log
    where user_id=p_user_id and id=v_run_id;

    if v_existing_status in ('completed','no_op','failed') then
      perform public.record_scheduler_heartbeat(
        p_user_id,'hourly_task_scheduler','no_op',v_version,null,60,15,null,p_automation_id
      );
      return jsonb_build_object(
        'status','no_op',
        'reason','idempotent_terminal_run',
        'terminal_run_status',v_existing_status,
        'logical_hour',v_logical_hour,
        'run_id',v_run_id,
        'probe',v_probe,
        'policy',v_policy,
        'recovery',v_recovery,
        'idempotency_key',v_idempotency_key
      );
    end if;

    v_lease := public.try_acquire_scheduler_lease(
      p_user_id,'hourly_task_scheduler',v_run_id,900
    );

    if not v_lease then
      perform public.record_scheduler_heartbeat(
        p_user_id,'hourly_task_scheduler','skipped_overlap',v_version,null,60,15,null,p_automation_id
      );
      return jsonb_build_object(
        'status','skipped_overlap',
        'logical_hour',v_logical_hour,
        'run_id',v_run_id,
        'probe',v_probe,
        'policy',v_policy,
        'recovery',v_recovery,
        'idempotency_key',v_idempotency_key
      );
    end if;

    perform public.record_scheduler_heartbeat(
      p_user_id,'hourly_task_scheduler','started',v_version,null,60,15,v_run_id,p_automation_id
    );

    return jsonb_build_object(
      'status','started',
      'logical_hour',v_logical_hour,
      'run_id',v_run_id,
      'probe',v_probe,
      'policy',v_policy,
      'recovery',v_recovery,
      'idempotency_key',v_idempotency_key
    );
  exception when others then
    v_error := jsonb_build_object(
      'error_type','scheduler_start_exception',
      'sqlstate',sqlstate,
      'message',sqlerrm
    );
    perform public.record_scheduler_heartbeat(
      p_user_id,'hourly_task_scheduler','failed',null,v_error,60,15,null,p_automation_id
    );
    return jsonb_build_object(
      'status','failed',
      'error',v_error
    );
  end;
end;
$function$;

create or replace function public.start_hourly_scheduler_run_with_catalog(
  p_user_id uuid,
  p_automation_id text,
  p_logical_hour timestamptz,
  p_trigger_mode text default 'scheduled'
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_logical_hour timestamptz;
  v_offset_minutes numeric;
  v_last_catalog timestamptz;
  v_interval_minutes integer := 60;
  v_project_id text;
  v_refresh_due boolean := false;
  v_base jsonb;
  v_error jsonb;
begin
  -- First database mutation in the wrapper is the proof-of-invocation heartbeat.
  perform public.record_scheduler_heartbeat(
    p_user_id,'hourly_task_scheduler','invoked',null,null,60,15,null,p_automation_id
  );

  begin
    v_logical_hour := (
      date_trunc(
        'hour',
        (p_logical_hour at time zone 'Europe/Berlin') + interval '30 minutes'
      ) at time zone 'Europe/Berlin'
    );

    v_offset_minutes := abs(extract(epoch from (p_logical_hour - v_logical_hour))) / 60.0;

    if v_offset_minutes > 15 then
      v_error := jsonb_build_object(
        'error_type','invocation_outside_tolerance',
        'observed_at',p_logical_hour,
        'nearest_logical_hour',v_logical_hour,
        'offset_minutes',round(v_offset_minutes,2),
        'allowed_lateness_minutes',15
      );
      perform public.record_scheduler_heartbeat(
        p_user_id,'hourly_task_scheduler','failed',null,v_error,60,15,null,p_automation_id
      );
      return jsonb_build_object(
        'status','failed',
        'logical_hour',v_logical_hour,
        'catalog_refresh_due',false,
        'error',v_error
      );
    end if;

    select
      nullif(value->>'last_sync_at','')::timestamptz,
      coalesce((value->>'sync_interval_minutes')::integer,60),
      nullif(value->>'project_id','')
    into v_last_catalog,v_interval_minutes,v_project_id
    from public.preferences
    where user_id=p_user_id
      and scope='action_engine'
      and key='todoist_catalog_surface'
    limit 1;

    v_refresh_due :=
      v_project_id is not null
      and (
        v_last_catalog is null
        or v_logical_hour >= v_last_catalog + make_interval(mins => v_interval_minutes)
      );

    if v_refresh_due then
      perform public.record_scheduler_signal(
        p_user_id,
        'todoist_catalog_refresh_due',
        'todoist_catalog_items',
        null,
        jsonb_build_object(
          'logical_hour',v_logical_hour,
          'catalog_project_id',v_project_id,
          'reason','Hourly scheduler owns catalog reconciliation.'
        ),
        'todoist_catalog_refresh_due:' ||
          to_char(v_logical_hour at time zone 'Europe/Berlin','YYYY-MM-DD"T"HH24:00')
      );
    end if;

    -- Pass the observed invocation time so the base facade independently enforces tolerance.
    v_base := public.start_hourly_scheduler_run(
      p_user_id,p_automation_id,p_logical_hour,p_trigger_mode
    );

    return v_base || jsonb_build_object(
      'catalog_refresh_due',v_refresh_due,
      'catalog_last_sync_at',v_last_catalog,
      'catalog_sync_interval_minutes',v_interval_minutes
    );
  exception when others then
    v_error := jsonb_build_object(
      'error_type','catalog_scheduler_start_exception',
      'sqlstate',sqlstate,
      'message',sqlerrm
    );
    perform public.record_scheduler_heartbeat(
      p_user_id,'hourly_task_scheduler','failed',null,v_error,60,15,null,p_automation_id
    );
    return jsonb_build_object(
      'status','failed',
      'catalog_refresh_due',v_refresh_due,
      'error',v_error
    );
  end;
end;
$function$;

create or replace function public.finish_hourly_scheduler_run(
  p_user_id uuid,
  p_run_id uuid,
  p_status text,
  p_sources_checked jsonb,
  p_changes_made jsonb,
  p_error jsonb,
  p_policy_version text,
  p_automation_id text
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_finish boolean;
  v_release boolean := false;
  v_hb jsonb;
  v_run_status text;
  v_external_checked boolean := false;
  v_checkpoint timestamptz := clock_timestamp();
  v_failure jsonb;
  v_state jsonb;
begin
  if p_status not in ('completed','failed','no_op') then
    v_failure := jsonb_build_object(
      'error_type','invalid_terminal_status',
      'requested_status',p_status,
      'run_id',p_run_id
    );
    v_hb := public.record_scheduler_heartbeat(
      p_user_id,'hourly_task_scheduler','failed',p_policy_version,v_failure,60,15,null,p_automation_id
    );
    return jsonb_build_object(
      'status','failed',
      'run_finished',false,
      'lease_released',false,
      'heartbeat',v_hb,
      'error',v_failure
    );
  end if;

  v_finish := public.finish_scheduler_run(
    p_user_id,p_run_id,p_status,p_sources_checked,p_changes_made,p_error
  );

  select status
  into v_run_status
  from public.scheduler_run_log
  where user_id=p_user_id and id=p_run_id;

  if not v_finish then
    v_failure := jsonb_build_object(
      'error_type','invalid_or_conflicting_run_transition',
      'run_id',p_run_id,
      'requested_status',p_status,
      'actual_status',v_run_status
    );
    v_hb := public.record_scheduler_heartbeat(
      p_user_id,'hourly_task_scheduler','failed',p_policy_version,v_failure,60,15,null,p_automation_id
    );
    return jsonb_build_object(
      'status','failed',
      'run_finished',false,
      'lease_released',false,
      'heartbeat',v_hb,
      'error',v_failure
    );
  end if;

  v_release := public.release_scheduler_lease(
    p_user_id,'hourly_task_scheduler',p_run_id
  );

  if p_status in ('completed','no_op') then
    if jsonb_typeof(coalesce(p_sources_checked,'[]'::jsonb))='array' then
      select exists(
        select 1
        from jsonb_array_elements_text(coalesce(p_sources_checked,'[]'::jsonb)) s(value)
        where lower(value) like '%todoist%'
           or lower(value) like '%calendar%'
           or lower(value) like '%gmail%'
      ) into v_external_checked;
    elsif jsonb_typeof(coalesce(p_sources_checked,'{}'::jsonb))='object' then
      select exists(
        select 1
        from jsonb_each(coalesce(p_sources_checked,'{}'::jsonb)) e(key,value)
        where (
          lower(key) like '%todoist%'
          or lower(key) like '%calendar%'
          or lower(key) like '%gmail%'
        )
        and value <> 'false'::jsonb
        and value <> 'null'::jsonb
      ) into v_external_checked;
    end if;

    select value
    into v_state
    from public.preferences
    where user_id=p_user_id
      and key='scheduler_runtime_state'
      and scope='action_engine'
    for update;

    if v_state is not null then
      v_state := jsonb_set(v_state,'{last_deep_run_at}',to_jsonb(v_checkpoint),true);
      v_state := jsonb_set(v_state,'{last_deep_run_id}',to_jsonb(p_run_id::text),true);
      if p_policy_version is not null then
        v_state := jsonb_set(
          v_state,'{scheduler_policy_source,policy_version}',to_jsonb(p_policy_version),true
        );
      end if;
      if v_external_checked then
        v_state := jsonb_set(v_state,'{last_external_refresh_at}',to_jsonb(v_checkpoint),true);
      end if;

      update public.preferences
      set value=v_state,updated_at=v_checkpoint
      where user_id=p_user_id
        and key='scheduler_runtime_state'
        and scope='action_engine';
    end if;
  end if;

  v_hb := public.record_scheduler_heartbeat(
    p_user_id,
    'hourly_task_scheduler',
    case
      when p_status='completed' then 'completed'
      when p_status='failed' then 'failed'
      else 'no_op'
    end,
    p_policy_version,
    p_error,
    60,15,null,p_automation_id
  );

  return jsonb_build_object(
    'status',p_status,
    'run_finished',true,
    'lease_released',v_release,
    'runtime_checkpoint_updated',p_status in ('completed','no_op'),
    'external_refresh_checkpoint_updated',v_external_checked,
    'heartbeat',v_hb
  );
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

  if coalesce(v_action.constraint_flags->>'todoist_task_id','') <> p_todoist_task_id then
    raise exception 'Todoist task mismatch for action %',p_action_id;
  end if;

  if v_action.status='completed' then
    -- Repair legacy surface metadata idempotently while preserving the provider task id as provenance.
    update public.actions
    set constraint_flags=constraint_flags || jsonb_build_object(
          'surface_state','completed',
          'todoist_completed_at',coalesce(constraint_flags->'todoist_completed_at',to_jsonb(p_completed_at)),
          'completion_source',coalesce(constraint_flags->'completion_source','"todoist"'::jsonb)
        ),
        updated_at=case
          when coalesce(constraint_flags->>'surface_state','')='completed' then updated_at
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
    nullif(value->>'last_deep_run_at','')::timestamptz,
    nullif(value->>'last_external_refresh_at','')::timestamptz,
    coalesce((value->>'external_refresh_interval_hours')::integer,4)
  into v_last_deep,v_last_external,v_external_interval_hours
  from public.preferences
  where user_id=p_user_id
    and key='scheduler_runtime_state'
    and scope='action_engine'
  limit 1;

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
        and not (key='scheduler_runtime_state' and scope='action_engine')
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
             and coalesce((a.constraint_flags->>'scheduler_controls_surface')::boolean,false)
             and coalesce(a.constraint_flags->>'surface_state','')='unsurfaced'
             and coalesce((a.constraint_flags->>'must_remain_open_until_complete')::boolean,false)
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
        'surface_state',constraint_flags->>'surface_state'
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
