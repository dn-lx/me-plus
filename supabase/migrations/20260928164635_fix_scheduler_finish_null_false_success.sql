
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

  return coalesce(v_existing_status = p_status,false);
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

  if coalesce(v_finish,false)=false then
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
