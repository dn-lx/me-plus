-- One transaction per bounded batch; source lock serializes timeout retries.
create or replace function public.server_ingest_health_batch(p_user_id uuid, p_input jsonb, p_revisions jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_source jsonb := p_input->'source';
  v_source_id uuid;
  v_run_id uuid;
  v_item jsonb;
  v_reading jsonb;
  v_key text;
  v_current public.raw_events%rowtype;
  v_raw_id uuid;
  v_current_key text;
  v_observation public.observations%rowtype;
  v_observation_id uuid;
  v_fields jsonb;
  v_corrected_value boolean;
  v_created integer := 0;
  v_updated integer := 0;
  v_resumed integer := 0;
  v_ignored integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_count integer;
  v_finished timestamptz;
  v_error text;
begin
  if p_user_id is null or jsonb_typeof(p_revisions) is distinct from 'array' then
    raise exception 'Health ingestion requires an owner and revision array';
  end if;
  v_count := jsonb_array_length(p_revisions);
  if v_count < 1 or v_count > 100 or v_count <> jsonb_array_length(p_input->'readings') then
    raise exception 'Health ingestion requires 1 to 100 readings';
  end if;
  if v_source->>'provider' not in ('health-connect','fake-health-connect')
     or nullif(btrim(v_source->>'displayName'),'') is null then
    raise exception 'Health ingestion requires a supported source';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_id::text || ':' || (v_source->>'provider') || ':' || (v_source->>'displayName'), 0));
  insert into public.data_sources(user_id,kind,provider,display_name,status,external_account_ref,metadata)
  values(p_user_id,'health_sensor',v_source->>'provider',v_source->>'displayName','active',
    v_source->>'externalAccountRef',coalesce(v_source->'metadata','{}'::jsonb))
  on conflict(user_id,provider,display_name) do update set
    external_account_ref=excluded.external_account_ref, metadata=excluded.metadata, status='active'
  returning id into v_source_id;
  insert into public.source_sync_runs(user_id,data_source_id,status,metadata)
  values(p_user_id,v_source_id,'running',jsonb_build_object('ingestion','me-plus-health-v4-atomic','requestedReadings',v_count))
  returning id into v_run_id;

  -- An inner subtransaction rolls back all health writes on any error while
  -- retaining an honest failed-attempt record and the last successful sync time.
  begin
    for v_item in select value from jsonb_array_elements(p_revisions) loop
      v_reading := v_item->'reading';
      v_key := v_item->>'revisionKey';
      if v_key is null or v_key !~ '^[0-9a-f]{64}$' then
        raise exception 'Health ingestion requires SHA-256 revision keys';
      end if;
      insert into public.raw_event_revisions(user_id,data_source_id,external_record_id,
        provider_last_modified_at,observed_at,revision_key,payload)
      values(p_user_id,v_source_id,v_reading->>'externalId',(v_reading->>'lastModifiedAt')::timestamptz,
        (v_reading->>'observedAt')::timestamptz,v_key,v_reading)
      on conflict(data_source_id,external_record_id,revision_key) do nothing;
    end loop;

    for v_item in
      select distinct on (value->'reading'->>'externalId') value
      from jsonb_array_elements(p_revisions)
      order by value->'reading'->>'externalId',
        (value->'reading'->>'lastModifiedAt')::timestamptz desc,
        (value->'reading'->>'observedAt')::timestamptz desc,
        (value->>'revisionKey') collate "C" desc
    loop
      v_reading := v_item->'reading';
      v_key := v_item->>'revisionKey';
      select * into v_current from public.raw_events
      where user_id=p_user_id and data_source_id=v_source_id
        and external_record_id=v_reading->>'externalId' for no key update;
      if found then
        -- v3 stored canonical JSON as content_hash. Convert it to the same
        -- digest as the new server before comparing equal-time revisions.
        -- Legacy null hashes bootstrap once at equal time; older times lose.
        v_current_key := case
          when v_current.content_hash ~ '^[0-9a-f]{64}$' then v_current.content_hash
          when v_current.content_hash is not null then pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(v_current.content_hash,'UTF8')),'hex')
          else '' end;
        if v_current.payload = v_reading or v_current.content_hash = v_key then
          if v_current.processing_status = 'processed' then
            v_ignored := v_ignored + 1;
            continue;
          end if;
          v_resumed := v_resumed + 1;
        elsif ((v_reading->>'lastModifiedAt')::timestamptz,
               (v_reading->>'observedAt')::timestamptz, v_key collate "C") <
              (coalesce((v_current.payload->>'lastModifiedAt')::timestamptz,'-infinity'),
               coalesce((v_current.payload->>'observedAt')::timestamptz,'-infinity'),
               v_current_key collate "C") then
          v_ignored := v_ignored + 1;
          continue;
        else
          v_updated := v_updated + 1;
        end if;
      else
        v_created := v_created + 1;
      end if;
      insert into public.raw_events(user_id,data_source_id,external_record_id,event_type,
        observed_at,payload,payload_schema_version,content_hash,processing_status,processed_at,error_code)
      values(p_user_id,v_source_id,v_reading->>'externalId','health-connect.'||(v_reading->>'metric'),
        (v_reading->>'observedAt')::timestamptz,v_reading,'1',v_key,'pending',null,null)
      on conflict(data_source_id,external_record_id) do update set
        observed_at=excluded.observed_at,payload=excluded.payload,content_hash=excluded.content_hash,
        processing_status='pending',processed_at=null,error_code=null
      returning id into v_raw_id;

      -- Serialize with the manual correction path before reading its markers.
      select * into v_observation from public.observations
      where user_id=p_user_id and data_source_id=v_source_id and raw_event_id=v_raw_id
        and observation_type=v_reading->>'metric' for update;
      v_fields := coalesce(v_observation.provenance->'userCorrectedFields','[]'::jsonb);
      v_corrected_value := v_fields ?| array['value_number','value_text','value_boolean','value_json'];
      insert into public.observations(user_id,data_source_id,raw_event_id,domain,observation_type,
        observed_at,value_number,value_text,value_boolean,value_json,unit,quality,confidence,provenance)
      values(p_user_id,v_source_id,v_raw_id,'health',v_reading->>'metric',(v_reading->>'observedAt')::timestamptz,
        case when v_corrected_value then v_observation.value_number else (v_reading->>'value')::double precision end,
        case when v_corrected_value then v_observation.value_text end,
        case when v_corrected_value then v_observation.value_boolean end,
        case when v_corrected_value then v_observation.value_json else v_reading->'sourcePayload' end,
        case when v_fields ? 'unit' then v_observation.unit else v_reading->>'unit' end,
        case when v_fields ? 'quality' then v_observation.quality else 'source' end,
        case when v_fields ? 'confidence' then v_observation.confidence else 1 end,
        coalesce(v_observation.provenance,'{}'::jsonb) || jsonb_build_object(
          'provider',v_reading->'provenance'->>'provider','sourcePackage',v_reading->'provenance'->>'sourcePackage',
          'device',v_reading->'provenance'->'device','recordingMethod',v_reading->'provenance'->'recordingMethod',
          'externalId',v_reading->>'externalId','lastModifiedAt',v_reading->>'lastModifiedAt','providerRevisionKey',v_key))
      on conflict(raw_event_id,observation_type) do update set
        observed_at=excluded.observed_at,value_number=excluded.value_number,value_text=excluded.value_text,
        value_boolean=excluded.value_boolean,value_json=excluded.value_json,unit=excluded.unit,
        quality=excluded.quality,confidence=excluded.confidence,provenance=excluded.provenance
      returning id into v_observation_id;
      v_ids := v_ids || jsonb_build_array(v_observation_id);
      update public.raw_events set processing_status='processed',processed_at=clock_timestamp(),error_code=null
      where id=v_raw_id and user_id=p_user_id and content_hash=v_key;
    end loop;
    v_finished := clock_timestamp();
    update public.source_sync_runs set status='completed',finished_at=v_finished,
      cursor_after=p_input->>'cursorAfter',records_seen=v_count,records_created=v_created,records_updated=v_updated,
      metadata=metadata||jsonb_build_object('resumedReadings',v_resumed,'staleReadingsIgnored',v_ignored)
    where id=v_run_id and user_id=p_user_id;
    update public.data_sources set last_sync_at=v_finished where id=v_source_id and user_id=p_user_id;
    return jsonb_build_object('dataSourceId',v_source_id,'syncRunId',v_run_id,'recordsSeen',v_count,
      'recordsCreated',v_created,'recordsUpdated',v_updated,'observationIds',v_ids);
  exception when others then
    get stacked diagnostics v_error = returned_sqlstate;
    update public.source_sync_runs set status='failed',finished_at=clock_timestamp(),
      error_code='health_atomic_'||v_error where id=v_run_id and user_id=p_user_id;
    return jsonb_build_object('error','health_atomic_'||v_error,'syncRunId',v_run_id);
  end;
end;
$function$;
revoke all on function public.server_ingest_health_batch(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.server_ingest_health_batch(uuid,jsonb,jsonb) to service_role;
comment on function public.server_ingest_health_batch(uuid,jsonb,jsonb) is
  'Server-only atomic bounded health ingestion. API authenticates and validates; source lock serializes retries and preserves provider revisions and manual corrections.';

