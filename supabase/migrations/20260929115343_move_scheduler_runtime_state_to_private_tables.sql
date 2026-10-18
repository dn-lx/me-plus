create table private.scheduler_runtime_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gate_version text not null default 'v4',
  last_deep_run_at timestamptz,
  last_deep_run_id uuid,
  last_external_refresh_at timestamptz,
  external_refresh_interval_hours integer not null default 4
    check (external_refresh_interval_hours between 1 and 168),
  external_refresh_window_start time not null default '07:00',
  external_refresh_window_end time not null default '23:59',
  supabase_project_ref text,
  connector_identity_rule text,
  last_connector_error jsonb,
  scheduler_policy_key text,
  scheduler_policy_version text,
  scheduler_policy_global_key text,
  scheduler_policy_source_document_id text,
  scheduler_policy_source_document_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.todoist_catalog_runtime_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  project_id text,
  project_name text,
  tasks_section_id text,
  routines_section_id text,
  sync_owner text not null default 'hourly_task_scheduler',
  sync_interval_minutes integer not null default 60
    check (sync_interval_minutes between 1 and 1440),
  separate_sync_automation_enabled boolean not null default false,
  last_sync_at timestamptz,
  add_semantics text,
  rename_semantics text,
  delete_semantics text,
  completion_semantics text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.scheduler_runtime_state enable row level security;
alter table private.todoist_catalog_runtime_state enable row level security;

revoke all on table private.scheduler_runtime_state from public, anon, authenticated;
revoke all on table private.todoist_catalog_runtime_state from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.scheduler_runtime_state to service_role;
grant select, insert, update, delete on table private.todoist_catalog_runtime_state to service_role;

insert into private.scheduler_runtime_state (
  user_id,
  gate_version,
  last_deep_run_at,
  last_deep_run_id,
  last_external_refresh_at,
  external_refresh_interval_hours,
  external_refresh_window_start,
  external_refresh_window_end,
  supabase_project_ref,
  connector_identity_rule,
  last_connector_error,
  scheduler_policy_key,
  scheduler_policy_version,
  scheduler_policy_global_key,
  scheduler_policy_source_document_id,
  scheduler_policy_source_document_title,
  updated_at
)
select
  user_id,
  coalesce(value->>'gate_version','v4'),
  nullif(value->>'last_deep_run_at','')::timestamptz,
  nullif(value->>'last_deep_run_id','')::uuid,
  nullif(value->>'last_external_refresh_at','')::timestamptz,
  coalesce((value->>'external_refresh_interval_hours')::integer,4),
  coalesce(nullif(value#>>'{external_refresh_local_window,start}','')::time,'07:00'::time),
  coalesce(nullif(value#>>'{external_refresh_local_window,end}','')::time,'23:59'::time),
  value->>'supabase_project_ref',
  value->>'connector_identity_rule',
  value->'last_connector_error',
  value#>>'{scheduler_policy_source,scheduler_policy_key}',
  value#>>'{scheduler_policy_source,policy_version}',
  value#>>'{scheduler_policy_source,global_policy_key}',
  value#>>'{scheduler_policy_source,source_document_id}',
  value#>>'{scheduler_policy_source,source_document_title}',
  updated_at
from public.preferences
where key='scheduler_runtime_state'
  and scope='action_engine';

insert into private.todoist_catalog_runtime_state (
  user_id,
  project_id,
  project_name,
  tasks_section_id,
  routines_section_id,
  sync_owner,
  sync_interval_minutes,
  separate_sync_automation_enabled,
  last_sync_at,
  add_semantics,
  rename_semantics,
  delete_semantics,
  completion_semantics,
  updated_at
)
select
  user_id,
  value->>'project_id',
  value->>'project_name',
  value->>'tasks_section_id',
  value->>'routines_section_id',
  coalesce(nullif(value->>'sync_owner',''),'hourly_task_scheduler'),
  coalesce((value->>'sync_interval_minutes')::integer,60),
  coalesce((value->>'separate_sync_automation_enabled')::boolean,false),
  nullif(value->>'last_sync_at','')::timestamptz,
  value->>'add_semantics',
  value->>'rename_semantics',
  value->>'delete_semantics',
  value->>'completion_semantics',
  updated_at
from public.preferences
where key='todoist_catalog_surface'
  and scope='action_engine';

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
    last_deep_run_at,
    last_external_refresh_at,
    external_refresh_interval_hours
  into v_last_deep,v_last_external,v_external_interval_hours
  from private.scheduler_runtime_state
  where user_id=p_user_id;

  v_external_interval_hours := coalesce(v_external_interval_hours,4);

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
        and not (
          scope='action_engine'
          and key in ('scheduler_runtime_state','todoist_catalog_surface')
        )
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

    insert into private.scheduler_runtime_state (
      user_id,
      last_deep_run_at,
      last_deep_run_id,
      last_external_refresh_at,
      scheduler_policy_version,
      updated_at
    )
    values (
      p_user_id,
      v_checkpoint,
      p_run_id,
      case when v_external_checked then v_checkpoint else null end,
      p_policy_version,
      v_checkpoint
    )
    on conflict (user_id) do update
    set last_deep_run_at=v_checkpoint,
        last_deep_run_id=p_run_id,
        last_external_refresh_at=case
          when v_external_checked then v_checkpoint
          else private.scheduler_runtime_state.last_external_refresh_at
        end,
        scheduler_policy_version=coalesce(
          p_policy_version,
          private.scheduler_runtime_state.scheduler_policy_version
        ),
        updated_at=v_checkpoint;
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
      last_sync_at,
      sync_interval_minutes,
      project_id
    into v_last_catalog,v_interval_minutes,v_project_id
    from private.todoist_catalog_runtime_state
    where user_id=p_user_id;

    v_interval_minutes := coalesce(v_interval_minutes,60);

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

create or replace function public.finish_todoist_catalog_refresh(
  p_user_id uuid,
  p_signal_ids uuid[],
  p_synced_at timestamptz,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_processed integer := 0;
begin
  if p_signal_ids is null or cardinality(p_signal_ids)=0 then
    raise exception 'Catalog refresh finish requires claimed signal ids';
  end if;

  update public.scheduler_signals
  set status='processed',
      processed_at=v_now,
      processing_note=left(
        'Deterministic Todoist Catalog reconciliation completed. ' ||
        coalesce(p_result,'{}'::jsonb)::text,
        2000
      )
  where user_id=p_user_id
    and signal_type='todoist_catalog_refresh_due'
    and status='claimed'
    and id=any(p_signal_ids);

  get diagnostics v_processed = row_count;

  update private.todoist_catalog_runtime_state
  set last_sync_at=p_synced_at,
      updated_at=p_synced_at
  where user_id=p_user_id;

  return jsonb_build_object(
    'status','processed',
    'processed_signal_count',v_processed,
    'synced_at',p_synced_at,
    'result',coalesce(p_result,'{}'::jsonb)
  );
end;
$function$;

create or replace function public.get_todoist_catalog_reconciliation_state(
  p_user_id uuid
)
returns jsonb
language sql
security definer
set search_path to 'public','pg_temp'
as $function$
  select jsonb_build_object(
    'project_id', cs.project_id,
    'project_name', cs.project_name,
    'tasks_section_id', cs.tasks_section_id,
    'routines_section_id', cs.routines_section_id,
    'last_sync_at', cs.last_sync_at,
    'mappings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'mapping_id',ci.id,
          'entity_type',ci.entity_type,
          'entity_id',ci.entity_id,
          'todoist_task_id',ci.todoist_task_id,
          'todoist_section_id',ci.todoist_section_id,
          'last_synced_title',ci.last_synced_title,
          'canonical_title',case
            when ci.entity_type='routine' then r.title
            when ci.entity_type='action' then a.title
            else null
          end,
          'canonical_status',case
            when ci.entity_type='routine' then case when r.active then 'active' else 'inactive' end
            when ci.entity_type='action' then a.status
            else null
          end
        )
        order by ci.entity_type,ci.last_synced_title,ci.id
      )
      from public.todoist_catalog_items ci
      left join public.routines r
        on ci.entity_type='routine' and r.id=ci.entity_id and r.user_id=ci.user_id
      left join public.actions a
        on ci.entity_type='action' and a.id=ci.entity_id and a.user_id=ci.user_id
      where ci.user_id=p_user_id and ci.catalog_status='active'
    ),'[]'::jsonb)
  )
  from private.todoist_catalog_runtime_state cs
  where cs.user_id=p_user_id;
$function$;

drop policy if exists preferences_insert on public.preferences;
drop policy if exists preferences_update on public.preferences;
drop policy if exists preferences_delete on public.preferences;

create policy preferences_insert
on public.preferences for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and not (
    scope='action_engine'
    and key in ('scheduler_runtime_state','todoist_catalog_surface')
  )
);

create policy preferences_update
on public.preferences for update
to authenticated
using (
  (select auth.uid()) = user_id
  and not (
    scope='action_engine'
    and key in ('scheduler_runtime_state','todoist_catalog_surface')
  )
)
with check (
  (select auth.uid()) = user_id
  and not (
    scope='action_engine'
    and key in ('scheduler_runtime_state','todoist_catalog_surface')
  )
);

create policy preferences_delete
on public.preferences for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and not (
    scope='action_engine'
    and key in ('scheduler_runtime_state','todoist_catalog_surface')
  )
);

delete from public.preferences
where scope='action_engine'
  and key in ('scheduler_runtime_state','todoist_catalog_surface');

comment on table private.scheduler_runtime_state is
  'Server-owned scheduler control state and checkpoints. Not user preferences.';
comment on table private.todoist_catalog_runtime_state is
  'Server-owned Todoist catalog control/configuration and sync checkpoint state. Not user preferences.';
