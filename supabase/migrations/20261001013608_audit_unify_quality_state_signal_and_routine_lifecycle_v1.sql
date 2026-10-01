
create index if not exists scheduler_runtime_exceptions_user_id_idx
  on private.scheduler_runtime_exceptions(user_id);
create index if not exists source_sync_leases_data_source_id_idx
  on private.source_sync_leases(data_source_id);
create index if not exists source_sync_leases_sync_run_id_idx
  on private.source_sync_leases(sync_run_id);

create or replace function private.apply_health_observation_quality_v1()
returns trigger language plpgsql
set search_path to 'public','private','pg_temp'
as $$
declare reason text;
begin
  if new.domain <> 'health' then return new; end if;
  if new.observed_at > now()+interval '10 minutes' then reason:='future_timestamp';
  elsif new.value_number is not null and new.observation_type in
    ('body-fat-mass','body-fat-percentage','bone-mass','fat-free-mass','fat-free-percentage',
     'muscle-mass','muscle-mass-percentage','skeletal-muscle-mass','skeletal-muscle-percentage',
     'healthsync.weight.total-body-water','basal-metabolic-rate')
    and new.value_number=0 then reason:='provider_zero_placeholder_not_measurement';
  elsif new.observation_type='heart-rate'
    and (new.unit is distinct from 'bpm' or new.value_number<20 or new.value_number>300)
    then reason:='invalid_heart_rate_unit_or_range';
  elsif new.observation_type='respiration-rate'
    and (new.unit is distinct from 'breaths/min' or new.value_number<2 or new.value_number>80)
    then reason:='invalid_respiration_unit_or_range';
  elsif new.observation_type='oxygen-saturation'
    and (new.unit is distinct from '%' or new.value_number<50 or new.value_number>100)
    then reason:='invalid_oxygen_saturation_unit_or_range';
  elsif new.observation_type='weight'
    and (new.unit is distinct from 'kg' or new.value_number<20 or new.value_number>500)
    then reason:='invalid_weight_unit_or_range';
  elsif new.observation_type='steps'
    and (new.unit is distinct from 'count' or new.value_number<0)
    then reason:='invalid_steps_unit_or_range';
  elsif new.observation_type in ('active-calories-burned','resting-calories-burned','total-calories-burned')
    and (new.unit is distinct from 'kcal' or new.value_number<0)
    then reason:='invalid_energy_unit_or_range';
  end if;

  if reason is not null then
    new.quality:='rejected_for_decision_use';
    new.confidence:=0;
    new.provenance:=coalesce(new.provenance,'{}'::jsonb)
      || jsonb_build_object('qualityGate','health-v1','qualityReason',reason);
  elsif new.observation_type in ('active-calories-burned','resting-calories-burned','total-calories-burned')
    and new.value_number=0 then
    new.quality:='accepted_with_warning';
    new.confidence:=least(coalesce(new.confidence,1),0.6);
    new.provenance:=coalesce(new.provenance,'{}'::jsonb)
      || jsonb_build_object('qualityGate','health-v1','qualityReason','zero_energy_value_requires_context');
  else
    new.provenance:=coalesce(new.provenance,'{}'::jsonb)
      || jsonb_build_object('qualityGate','health-v1');
  end if;
  return new;
end $$;

update public.observations
set quality='rejected_for_decision_use', updated_at=clock_timestamp()
where domain='health' and quality='rejected';

create or replace function public.get_health_context(
  p_user_id uuid, p_as_of timestamptz default now()
)
returns jsonb language plpgsql stable
set search_path to ''
as $$
declare
  v_timezone text; v_day_start timestamptz; v_day_end timestamptz;
  v_latest jsonb; v_daily jsonb; v_quality jsonb; v_sources jsonb;
begin
  select coalesce(timezone,'UTC') into v_timezone from public.profiles where id=p_user_id;
  v_timezone:=coalesce(v_timezone,'UTC');
  v_day_start:=date_trunc('day',p_as_of at time zone v_timezone) at time zone v_timezone;
  v_day_end:=v_day_start+interval '1 day';

  select coalesce(jsonb_object_agg(q.observation_type,jsonb_build_object(
    'observed_at',q.observed_at,'value_number',q.value_number,'value_text',q.value_text,
    'unit',q.unit,'quality',q.quality,'confidence',q.confidence,
    'provider',q.provider,'source',q.display_name
  )),'{}'::jsonb)
  into v_latest
  from (
    select * from (
      select distinct on (o.observation_type)
        o.observation_type,o.observed_at,o.value_number,o.value_text,o.unit,
        o.quality,o.confidence,ds.provider,ds.display_name
      from public.observations o
      left join public.data_sources ds on ds.id=o.data_source_id
      where o.user_id=p_user_id and o.domain='health'
        and o.observed_at<=p_as_of
        and o.observed_at>=p_as_of-interval '14 days'
        and coalesce(o.quality,'accepted') not in
          ('rejected','rejected_for_decision_use','corrected/superseded')
      order by o.observation_type,o.observed_at desc,
        case ds.provider when 'health-connect' then 1 when 'google-drive-healthsync' then 2 else 3 end
    ) d order by observed_at desc limit 50
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'metric',x.observation_type,'provider',x.provider,'source',x.display_name,
    'value',x.total_value,'unit',x.unit,'samples',x.samples,
    'first_at',x.first_at,'last_at',x.last_at
  ) order by x.observation_type,x.provider),'[]'::jsonb)
  into v_daily
  from (
    select o.observation_type,ds.provider,ds.display_name,o.unit,
      sum(o.value_number) total_value,count(*) samples,
      min(o.observed_at) first_at,max(o.observed_at) last_at
    from public.observations o
    left join public.data_sources ds on ds.id=o.data_source_id
    where o.user_id=p_user_id and o.domain='health'
      and o.observed_at>=v_day_start
      and o.observed_at<least(v_day_end,p_as_of+interval '1 second')
      and o.observation_type in
        ('steps','active-calories-burned','resting-calories-burned','total-calories-burned')
      and o.value_number is not null
      and coalesce(o.quality,'accepted') not in
        ('suspect','rejected','rejected_for_decision_use','corrected/superseded')
    group by o.observation_type,ds.provider,ds.display_name,o.unit
  ) x;

  select jsonb_build_object(
    'accepted',count(*) filter(where coalesce(quality,'accepted') in ('accepted','source')),
    'accepted_with_warning',count(*) filter(where quality='accepted_with_warning'),
    'suspect',count(*) filter(where quality='suspect'),
    'rejected',count(*) filter(where quality in ('rejected','rejected_for_decision_use')),
    'latest_observation_at',max(observed_at)
  ) into v_quality
  from public.observations
  where user_id=p_user_id and domain='health'
    and observed_at>=p_as_of-interval '24 hours' and observed_at<=p_as_of;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',provider,'display_name',display_name,'last_sync_at',last_sync_at,'status',status
  ) order by provider,display_name),'[]'::jsonb)
  into v_sources
  from public.data_sources
  where user_id=p_user_id and kind in ('health_sensor','health_file_export');

  return jsonb_build_object(
    'as_of',p_as_of,'timezone',v_timezone,'latest',v_latest,
    'today_totals_by_source',v_daily,'quality_24h',coalesce(v_quality,'{}'::jsonb),
    'sources',v_sources
  );
end $$;

create or replace function public.get_due_routines(
  p_user_id uuid, p_as_of timestamptz default now()
)
returns jsonb language sql stable
set search_path to 'public','pg_temp'
as $$
with cfg as (
  select coalesce(p.timezone,'UTC') timezone,
         (p_as_of at time zone coalesce(p.timezone,'UTC'))::date local_date,
         (p_as_of at time zone coalesce(p.timezone,'UTC'))::time local_time
  from public.profiles p where p.id=p_user_id
),
due as (
  select r.id routine_id,rs.id schedule_id,re.id routine_event_id,a.id action_id,
         r.title,r.domain,r.importance,r.normal_duration_minutes,
         r.reduced_duration_minutes,r.minimum_duration_minutes,
         r.normal_definition,r.reduced_definition,r.minimum_definition,
         coalesce(re.scheduled_for,
           ((cfg.local_date+coalesce(rs.local_time,time '00:00')) at time zone cfg.timezone)
         ) scheduled_for,
         coalesce(re.window_start,
           case when rs.window_start_local is not null
             then ((cfg.local_date+rs.window_start_local) at time zone cfg.timezone) end
         ) window_start,
         coalesce(re.window_end,
           case when rs.window_end_local is not null
             then ((cfg.local_date+rs.window_end_local) at time zone cfg.timezone) end
         ) window_end,
         re.status routine_event_status,a.status action_status,
         a.planned_start,a.planned_end,a.due_at,
         case when re.id is null then 'scheduled_due' else 'materialized_due' end due_source
  from cfg
  join public.routines r on r.user_id=p_user_id and r.active
  join public.routine_schedules rs
    on rs.user_id=r.user_id and rs.routine_id=r.id and rs.schedule_type='daily'
   and (rs.starts_on is null or rs.starts_on<=cfg.local_date)
   and (rs.ends_on is null or rs.ends_on>=cfg.local_date)
  left join public.routine_events re
    on re.user_id=r.user_id and re.routine_id=r.id
   and re.routine_schedule_id=rs.id and re.occurrence_date=cfg.local_date
  left join lateral (
    select x.id,x.status,x.planned_start,x.planned_end,x.due_at
    from public.actions x
    where x.user_id=r.user_id and x.routine_event_id=re.id
      and x.status in ('proposed','planned','available','in_progress','partial')
    order by x.created_at desc limit 1
  ) a on true
  where (re.id is null or re.status='due')
    and case
      when rs.window_start_local is not null and rs.window_end_local is not null
           and rs.window_start_local<=rs.window_end_local
        then cfg.local_time between rs.window_start_local and rs.window_end_local
      when rs.window_start_local is not null and rs.window_end_local is not null
        then cfg.local_time>=rs.window_start_local or cfg.local_time<=rs.window_end_local
      when rs.local_time is not null then cfg.local_time>=rs.local_time
      else true
    end
)
select coalesce(jsonb_agg(jsonb_build_object(
  'routine_id',routine_id,'schedule_id',schedule_id,'routine_event_id',routine_event_id,
  'action_id',action_id,'title',title,'domain',domain,'importance',importance,
  'normal_duration_minutes',normal_duration_minutes,
  'reduced_duration_minutes',reduced_duration_minutes,
  'minimum_duration_minutes',minimum_duration_minutes,
  'normal_definition',normal_definition,'reduced_definition',reduced_definition,
  'minimum_definition',minimum_definition,'scheduled_for',scheduled_for,
  'window_start',window_start,'window_end',window_end,
  'routine_event_status',routine_event_status,'action_status',action_status,
  'planned_start',planned_start,'planned_end',planned_end,'due_at',due_at,
  'due_source',due_source
) order by importance desc,scheduled_for,title),'[]'::jsonb)
from due
$$;

create or replace function public.get_personal_state_summary(
  p_user_id uuid, p_as_of timestamptz default now()
)
returns jsonb language plpgsql stable
set search_path to ''
as $$
declare v_due jsonb; v_checkin public.daily_checkins%rowtype;
begin
  v_due:=public.get_due_routines(p_user_id,p_as_of);
  select * into v_checkin
  from public.daily_checkins
  where user_id=p_user_id and observed_at<=p_as_of
  order by observed_at desc limit 1;

  return jsonb_build_object(
    'active_goal_count',(select count(*) from public.goals
      where user_id=p_user_id and status='active' and created_at<=p_as_of),
    'due_routine_count',jsonb_array_length(coalesce(v_due,'[]'::jsonb)),
    'latest_checkin_at',v_checkin.observed_at,
    'mood',v_checkin.mood,'energy',v_checkin.energy,'stress',v_checkin.stress,
    'soreness',v_checkin.soreness,'sleep_quality',v_checkin.sleep_quality,
    'completed_actions_7d',(select count(*) from public.actions
      where user_id=p_user_id and status='completed'
        and updated_at>p_as_of-interval '7 days' and updated_at<=p_as_of),
    'partial_actions_7d',(select count(*) from public.actions
      where user_id=p_user_id and status='partial'
        and updated_at>p_as_of-interval '7 days' and updated_at<=p_as_of),
    'skipped_actions_7d',(select count(*) from public.actions
      where user_id=p_user_id and status='skipped'
        and updated_at>p_as_of-interval '7 days' and updated_at<=p_as_of),
    'expired_actions_7d',(select count(*) from public.actions
      where user_id=p_user_id and status='expired'
        and updated_at>p_as_of-interval '7 days' and updated_at<=p_as_of)
  );
end $$;

create or replace view public.current_personal_state_inputs as
select
  p.id as user_id,
  (s.summary->>'active_goal_count')::bigint as active_goal_count,
  (s.summary->>'due_routine_count')::bigint as due_routine_count,
  nullif(s.summary->>'latest_checkin_at','')::timestamptz as latest_checkin_at,
  nullif(s.summary->>'mood','')::smallint as mood,
  nullif(s.summary->>'energy','')::smallint as energy,
  nullif(s.summary->>'stress','')::smallint as stress,
  nullif(s.summary->>'soreness','')::smallint as soreness,
  nullif(s.summary->>'sleep_quality','')::smallint as sleep_quality,
  (s.summary->>'completed_actions_7d')::bigint as completed_actions_7d,
  (s.summary->>'partial_actions_7d')::bigint as partial_actions_7d,
  (s.summary->>'skipped_actions_7d')::bigint as skipped_actions_7d
from public.profiles p
cross join lateral (
  select public.get_personal_state_summary(p.id,now()) summary
) s;

create or replace function public.build_personal_state(
  p_user_id uuid, p_as_of timestamptz default now()
)
returns jsonb language sql stable
set search_path to 'public','pg_temp'
as $$
select jsonb_build_object(
  'schema_version','v2','as_of',p_as_of,
  'profile',(select jsonb_build_object('timezone',timezone,'locale',locale)
             from public.profiles where id=p_user_id),
  'summary',public.get_personal_state_summary(p_user_id,p_as_of),
  'health',public.get_health_context(p_user_id,p_as_of),
  'active_goals',public.get_active_goals(p_user_id),
  'due_routines',public.get_due_routines(p_user_id,p_as_of),
  'open_actions',(
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'domain',domain,'priority',priority,'status',status,
      'available_from',available_from,'due_at',due_at,'estimated_minutes',estimated_minutes,
      'reason',reason
    ) order by case priority when 'must' then 1 when 'should' then 2 else 3 end,
       due_at nulls last,created_at),'[]'::jsonb)
    from public.actions
    where user_id=p_user_id and created_at<=p_as_of
      and status in ('proposed','planned','available','in_progress','partial')
  ),
  'calendar_next_24h',(
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'starts_at',starts_at,'ends_at',ends_at,
      'busy',busy,'status',status
    ) order by starts_at),'[]'::jsonb)
    from public.calendar_events
    where user_id=p_user_id and starts_at<p_as_of+interval '24 hours'
      and ends_at>p_as_of and status<>'cancelled'
  ),
  'pending_scheduler_signals',public.get_pending_scheduler_signals(p_user_id,20)
)
$$;

create or replace function private.reconcile_stale_routine_occurrences(
  p_user_id uuid, p_now timestamptz default clock_timestamp()
)
returns jsonb language plpgsql security definer
set search_path to ''
as $$
declare v_tz text; v_local_date date; v_expired_actions jsonb; v_missed_events jsonb;
begin
  select coalesce(timezone,'UTC') into v_tz from public.profiles where id=p_user_id;
  v_tz:=coalesce(v_tz,'UTC');
  v_local_date:=(p_now at time zone v_tz)::date;

  with stale_events as (
    select re.id
    from public.routine_events re
    where re.user_id=p_user_id and re.status='due'
      and re.occurrence_date is not null and re.occurrence_date<v_local_date
      and not exists (
        select 1 from public.actions d
        where d.user_id=re.user_id and d.routine_event_id=re.id and d.status='completed'
      )
      and not exists (
        select 1 from public.actions s
        where s.user_id=re.user_id and s.routine_event_id=re.id
          and s.surface_external_id is not null and s.surface_state='surfaced'
      )
  ), expired as (
    update public.actions a
    set status='expired',
        constraint_flags=coalesce(a.constraint_flags,'{}'::jsonb)||jsonb_build_object(
          'terminalized_by','stale_routine_reconciliation_v1',
          'terminalized_at',p_now,
          'terminal_reason','routine_occurrence_elapsed_without_recorded_completion'
        ),
        updated_at=p_now
    from stale_events s
    where a.user_id=p_user_id and a.routine_event_id=s.id
      and a.status in ('proposed','planned','available','in_progress','partial')
    returning a.id,a.user_id,a.routine_event_id
  ), logged as (
    insert into public.action_events(
      user_id,action_id,event_type,occurred_at,reason_code,note,metadata
    )
    select e.user_id,e.id,'expired',p_now,'routine_occurrence_elapsed_uncompleted',
      'Automatically terminalized after the local occurrence date elapsed without recorded completion.',
      jsonb_build_object('routine_event_id',e.routine_event_id,
                         'reconciler','stale_routine_reconciliation_v1')
    from expired e
    returning action_id
  )
  select coalesce(jsonb_agg(action_id),'[]'::jsonb)
  into v_expired_actions from logged;

  with stale_events as (
    select re.id
    from public.routine_events re
    where re.user_id=p_user_id and re.status='due'
      and re.occurrence_date is not null and re.occurrence_date<v_local_date
      and not exists (
        select 1 from public.actions d
        where d.user_id=re.user_id and d.routine_event_id=re.id and d.status='completed'
      )
      and not exists (
        select 1 from public.actions s
        where s.user_id=re.user_id and s.routine_event_id=re.id
          and s.surface_external_id is not null and s.surface_state='surfaced'
      )
  ), missed as (
    update public.routine_events re
    set status='missed',updated_at=p_now
    from stale_events s where re.id=s.id
    returning re.id
  )
  select coalesce(jsonb_agg(id),'[]'::jsonb)
  into v_missed_events from missed;

  return jsonb_build_object(
    'local_date',v_local_date,'timezone',v_tz,
    'expired_action_ids',coalesce(v_expired_actions,'[]'::jsonb),
    'missed_routine_event_ids',coalesce(v_missed_events,'[]'::jsonb)
  );
end $$;

create or replace function private.mark_completed_dispatch_signals_processed()
returns trigger language plpgsql security definer
set search_path to ''
as $$
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    update public.scheduler_signals s
    set status='processed',processed_at=clock_timestamp(),
        processing_note='scheduler_dispatch_completed:'||new.id::text
    where s.user_id=new.user_id and s.status in ('new','claimed')
      and s.signal_type<>'todoist_catalog_refresh_due'
      and exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof(new.payload->'pending_scheduler_signals')='array'
               then new.payload->'pending_scheduler_signals' else '[]'::jsonb end
        ) x where x->>'id'=s.id::text
      );
  end if;
  return new;
end $$;

drop trigger if exists trg_scheduler_dispatch_process_signals on public.scheduler_dispatches;
create trigger trg_scheduler_dispatch_process_signals
after update of status on public.scheduler_dispatches
for each row execute function private.mark_completed_dispatch_signals_processed();

update public.scheduler_signals s
set status='processed',
    processed_at=coalesce(s.processed_at,clock_timestamp()),
    processing_note=coalesce(s.processing_note,'backfilled_from_completed_scheduler_dispatch')
where s.status in ('new','claimed')
  and s.signal_type<>'todoist_catalog_refresh_due'
  and exists (
    select 1 from public.scheduler_dispatches d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.payload->'pending_scheduler_signals')='array'
           then d.payload->'pending_scheduler_signals' else '[]'::jsonb end
    ) x
    where d.user_id=s.user_id and d.status='completed' and x->>'id'=s.id::text
  );

do $$
declare u record;
begin
  for u in select id from public.profiles loop
    perform private.reconcile_stale_routine_occurrences(u.id,clock_timestamp());
  end loop;
end $$;

create or replace function public.start_hourly_scheduler_run_with_catalog(
  p_user_id uuid,p_automation_id text,p_logical_hour timestamptz,
  p_trigger_mode text default 'scheduled'
)
returns jsonb language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_logical_hour timestamptz; v_offset_minutes numeric; v_last_catalog timestamptz;
  v_interval_minutes integer:=60; v_project_id text; v_refresh_due boolean:=false;
  v_base jsonb; v_error jsonb;
begin
  perform public.record_scheduler_heartbeat(
    p_user_id,'hourly_task_scheduler','invoked',null,null,60,15,null,p_automation_id
  );
  begin
    v_logical_hour:=(date_trunc(
      'hour',(p_logical_hour at time zone 'Europe/Berlin')+interval '30 minutes'
    ) at time zone 'Europe/Berlin');
    v_offset_minutes:=abs(extract(epoch from (p_logical_hour-v_logical_hour)))/60.0;

    if v_offset_minutes>15 then
      v_error:=jsonb_build_object(
        'error_type','invocation_outside_tolerance','observed_at',p_logical_hour,
        'nearest_logical_hour',v_logical_hour,'offset_minutes',round(v_offset_minutes,2),
        'allowed_lateness_minutes',15
      );
      perform public.record_scheduler_heartbeat(
        p_user_id,'hourly_task_scheduler','failed',null,v_error,60,15,null,p_automation_id
      );
      return jsonb_build_object(
        'status','failed','logical_hour',v_logical_hour,'catalog_refresh_due',false,'error',v_error
      );
    end if;

    perform private.reconcile_stale_routine_occurrences(p_user_id,v_logical_hour);

    select last_sync_at,sync_interval_minutes,project_id
      into v_last_catalog,v_interval_minutes,v_project_id
    from private.todoist_catalog_runtime_state where user_id=p_user_id;

    v_interval_minutes:=coalesce(v_interval_minutes,60);
    v_refresh_due:=v_project_id is not null
      and (v_last_catalog is null
           or v_logical_hour>=v_last_catalog+make_interval(mins=>v_interval_minutes));

    if v_refresh_due then
      perform public.record_scheduler_signal(
        p_user_id,'todoist_catalog_refresh_due','todoist_catalog_items',null,
        jsonb_build_object(
          'logical_hour',v_logical_hour,'catalog_project_id',v_project_id,
          'reason','Hourly scheduler owns catalog reconciliation.'
        ),
        'todoist_catalog_refresh_due:'||
          to_char(v_logical_hour at time zone 'Europe/Berlin','YYYY-MM-DD"T"HH24:00')
      );
    end if;

    v_base:=public.start_hourly_scheduler_run(
      p_user_id,p_automation_id,p_logical_hour,p_trigger_mode
    );

    return v_base||jsonb_build_object(
      'catalog_refresh_due',v_refresh_due,'catalog_last_sync_at',v_last_catalog,
      'catalog_sync_interval_minutes',v_interval_minutes
    );
  exception when others then
    v_error:=jsonb_build_object(
      'error_type','catalog_scheduler_start_exception','sqlstate',sqlstate,'message',sqlerrm
    );
    perform public.record_scheduler_heartbeat(
      p_user_id,'hourly_task_scheduler','failed',null,v_error,60,15,null,p_automation_id
    );
    return jsonb_build_object(
      'status','failed','catalog_refresh_due',v_refresh_due,'error',v_error
    );
  end;
end $$;
