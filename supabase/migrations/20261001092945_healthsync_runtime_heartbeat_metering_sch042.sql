create or replace function public.server_begin_healthsync_run(
  p_user_id uuid,
  p_run_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path=''
as $function$
declare
  v_source_id uuid;
  v_run_id uuid;
  v_key text;
  v_existing public.source_sync_runs%rowtype;
begin
  if p_user_id is null then
    raise exception 'HealthSync ingestion requires an owner';
  end if;

  select id into v_source_id
  from public.data_sources
  where user_id=p_user_id
    and provider='google-drive-healthsync'
    and display_name='Health Sync · Google Drive'
    and status='active'
  limit 1;

  if v_source_id is null then
    raise exception 'HealthSync data source is not configured';
  end if;

  perform public.record_scheduler_heartbeat(
    p_user_id,'healthsync_drive_ingestion','invoked',null,null,15,10,null,
    'supabase:healthsync_drive_ingestion'
  );

  v_key := coalesce(
    nullif(btrim(p_run_key),''),
    'healthsync_drive:' ||
      to_char(
        date_bin(
          interval '15 minutes',
          clock_timestamp(),
          timestamptz '2000-01-01 00:00:00+00'
        ) at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI"Z"'
      )
  );

  select * into v_existing
  from public.source_sync_runs
  where user_id=p_user_id
    and data_source_id=v_source_id
    and metadata->>'syncPurpose'='healthsync_drive'
    and metadata->>'runKey'=v_key
    and status='completed'
  order by finished_at desc nulls last
  limit 1;

  if found then
    return jsonb_build_object(
      'status','already_completed',
      'dataSourceId',v_source_id,
      'syncRunId',v_existing.id,
      'runKey',v_key
    );
  end if;

  begin
    insert into public.source_sync_runs(
      user_id,data_source_id,status,metadata
    ) values (
      p_user_id,v_source_id,'running',
      coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object(
        'ingestion','me-plus-healthsync-drive-v1',
        'syncPurpose','healthsync_drive',
        'runKey',v_key,
        'leaseSeconds',600,
        'maxAttempts',3,
        'duplicateReadings',0,
        'conflictingReadings',0
      )
    )
    returning id into v_run_id;
  exception when raise_exception then
    select * into v_existing
    from public.source_sync_runs
    where user_id=p_user_id
      and data_source_id=v_source_id
      and metadata->>'syncPurpose'='healthsync_drive'
      and metadata->>'runKey'=v_key
    order by started_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'status',case when v_existing.status='running' then 'already_running' else v_existing.status end,
        'dataSourceId',v_source_id,
        'syncRunId',v_existing.id,
        'runKey',v_key
      );
    end if;
    raise;
  end;

  return jsonb_build_object(
    'status','started',
    'dataSourceId',v_source_id,
    'syncRunId',v_run_id,
    'runKey',v_key
  );
end;
$function$;

create or replace function public.server_finish_healthsync_run(
  p_user_id uuid,
  p_sync_run_id uuid,
  p_status text,
  p_cursor_after text default null,
  p_error_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path=''
as $function$
declare
  v_run public.source_sync_runs%rowtype;
  v_finished timestamptz := clock_timestamp();
  v_signal uuid;
begin
  if p_status not in ('completed','failed') then
    raise exception 'HealthSync run status must be completed or failed';
  end if;

  select * into v_run
  from public.source_sync_runs
  where id=p_sync_run_id and user_id=p_user_id
    and metadata->>'syncPurpose'='healthsync_drive'
  for update;

  if not found then
    raise exception 'Unknown HealthSync run';
  end if;

  if v_run.status in ('completed','failed') then
    return jsonb_build_object(
      'status',v_run.status,'syncRunId',v_run.id,'alreadyTerminal',true
    );
  end if;

  update public.source_sync_runs
  set status=p_status,
      finished_at=v_finished,
      cursor_after=p_cursor_after,
      error_code=p_error_code,
      metadata=coalesce(metadata,'{}'::jsonb) || coalesce(p_metadata,'{}'::jsonb)
  where id=p_sync_run_id and user_id=p_user_id
  returning * into v_run;

  if p_status='completed' then
    update public.data_sources
    set last_sync_at=v_finished,
        metadata=metadata || jsonb_build_object('lastCompletedRunId',p_sync_run_id),
        updated_at=v_finished
    where id=v_run.data_source_id and user_id=p_user_id;

    if coalesce(v_run.records_created,0)+coalesce(v_run.records_updated,0) > 0 then
      v_signal := public.record_scheduler_signal(
        p_user_id,
        'health_data_changed',
        'source_sync_runs',
        p_sync_run_id,
        jsonb_build_object(
          'provider','google-drive-healthsync',
          'recordsCreated',v_run.records_created,
          'recordsUpdated',v_run.records_updated,
          'recordsSeen',v_run.records_seen,
          'duplicateReadings',coalesce((v_run.metadata->>'duplicateReadings')::integer,0),
          'conflictingReadings',coalesce((v_run.metadata->>'conflictingReadings')::integer,0)
        ),
        'healthsync:'||p_sync_run_id::text
      );
    end if;

    perform public.record_scheduler_heartbeat(
      p_user_id,'healthsync_drive_ingestion','completed',null,null,15,10,null,
      'supabase:healthsync_drive_ingestion'
    );
  else
    perform public.record_scheduler_heartbeat(
      p_user_id,'healthsync_drive_ingestion','failed',null,
      jsonb_build_object(
        'error_code',p_error_code,
        'sync_run_id',p_sync_run_id,
        'metadata',coalesce(p_metadata,'{}'::jsonb)
      ),
      15,10,null,'supabase:healthsync_drive_ingestion'
    );
  end if;

  return jsonb_build_object(
    'status',p_status,
    'syncRunId',p_sync_run_id,
    'recordsSeen',v_run.records_seen,
    'recordsCreated',v_run.records_created,
    'recordsUpdated',v_run.records_updated,
    'signalId',v_signal
  );
end;
$function$;

update private.scheduler_runtime_registry
set heartbeat_required=true,
    expected_cadence_minutes=15,
    allowed_lateness_minutes=10,
    updated_at=clock_timestamp()
where scheduler_key='healthsync_drive_ingestion';
