begin;
do $test$
declare
  owner uuid := '459ab99b-d99d-492b-bb23-95144dbb1e47';
  source jsonb := '{"provider":"health-connect","displayName":"isolated-batch-regression","externalAccountRef":"test"}';
  reading jsonb := '{"externalId":"one","metric":"heart-rate","value":70,"unit":"bpm","observedAt":"2026-09-29T10:00:00Z","lastModifiedAt":"2026-09-29T10:01:00Z","provenance":{"provider":"health-connect","sourcePackage":"test"}}';
  input jsonb; result jsonb; ds uuid; first_run uuid;
begin
  input := jsonb_build_object('source',source,'readings',jsonb_build_array(reading));
  result := public.server_ingest_health_batch(owner,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('a',64))));
  if result ? 'error' or (result->>'recordsCreated')::int is distinct from 1 or result->>'syncRunId' is null then raise exception 'First batch failed: %',result; end if;
  ds := (result->>'dataSourceId')::uuid; first_run := (result->>'syncRunId')::uuid;
  reading := reading || '{"externalId":"two"}';
  input := jsonb_build_object('source',source,'readings',jsonb_build_array(reading));
  -- The unfixed guard rejects this with source_sync_already_completed / P0001.
  result := public.server_ingest_health_batch(owner,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('b',64))));
  if result ? 'error' or (result->>'recordsCreated')::int is distinct from 1 then raise exception 'Second batch failed: %',result; end if;
  if (select metadata->>'runKey' from public.source_sync_runs where id=first_run) =
     (select metadata->>'runKey' from public.source_sync_runs where id=(result->>'syncRunId')::uuid) then raise exception 'Batch run keys collided'; end if;
  if (select metadata->>'runKey' from public.source_sync_runs where id=first_run) is distinct from ('health_batch:' || first_run::text)
     or (select metadata->>'runKey' from public.source_sync_runs where id=(result->>'syncRunId')::uuid) is distinct from ('health_batch:' || (result->>'syncRunId')) then raise exception 'Missing or incorrect health run key'; end if;
  result := public.server_ingest_health_batch(owner,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('b',64))));
  if result ? 'error' or (result->>'recordsCreated')::int is distinct from 0 or (select count(*) from public.observations where data_source_id=ds) <> 2 then raise exception 'Retry duplicated records'; end if;
  if exists(select 1 from private.source_sync_leases where data_source_id=ds) then raise exception 'Completed batch retained lease'; end if;
  -- Ordinary sync callers retain their completed-run protection.
  insert into public.source_sync_runs(user_id,data_source_id,status,metadata) values(owner,ds,'running','{"runKey":"ordinary","syncPurpose":"ordinary"}');
  update public.source_sync_runs set status='completed' where data_source_id=ds and status='running';
  begin
    insert into public.source_sync_runs(user_id,data_source_id,status,metadata) values(owner,ds,'running','{"runKey":"ordinary","syncPurpose":"ordinary"}');
    raise exception 'Ordinary duplicate protection was removed';
  exception when raise_exception then
    if sqlerrm <> 'source_sync_already_completed' then raise; end if;
  end;
  -- A real running lease must still block health uploads, including new keys.
  insert into public.source_sync_runs(user_id,data_source_id,status,metadata) values(owner,ds,'running','{"ingestion":"me-plus-health-v4-atomic"}');
  begin
    perform public.server_ingest_health_batch(owner,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('b',64))));
    raise exception 'Overlap guard was removed';
  exception when raise_exception then
    if sqlerrm <> 'source_sync_overlap' then raise; end if;
  end;
end;
$test$;
rollback;
