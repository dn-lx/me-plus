begin;
do $test$
declare
  u uuid := '459ab99b-d99d-492b-bb23-95144dbb1e47';
  source jsonb := '{"provider":"health-connect","displayName":"__pr37_atomic_acceptance__","externalAccountRef":"test"}';
  reading jsonb := '{"externalId":"test-record-1","metric":"heart-rate","value":70,"unit":"bpm","observedAt":"2026-09-29T10:00:00Z","lastModifiedAt":"2026-09-29T10:01:00Z","provenance":{"provider":"health-connect","sourcePackage":"test"}}';
  input jsonb;
  result jsonb;
  ds uuid;
  rawid uuid;
  lastgood timestamptz;
  count_rows integer;
begin
  input := jsonb_build_object('source',source,'readings',jsonb_build_array(reading));
  result := public.server_ingest_health_batch(u,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('a',64))));
  if result ? 'error' or (result->>'recordsCreated')::int <> 1 then raise exception 'Initial ingestion failed: %',result; end if;
  ds := (result->>'dataSourceId')::uuid;
  select id into rawid from public.raw_events where data_source_id=ds;
  result := public.server_ingest_health_batch(u,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('a',64))));
  if (result->>'recordsCreated')::int <> 0 or (result->>'recordsUpdated')::int <> 0 then raise exception 'Retry not idempotent'; end if;
  select count(*) into count_rows from public.observations where data_source_id=ds;
  if count_rows <> 1 then raise exception 'Duplicate observation'; end if;
  reading := reading || '{"value":72,"lastModifiedAt":"2026-09-29T10:09:00Z"}';
  input := jsonb_build_object('source',source,'readings',jsonb_build_array(reading));
  result := public.server_ingest_health_batch(u,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('b',64))));
  if result ? 'error' or (result->>'recordsUpdated')::int <> 1 then raise exception 'New revision failed: %',result; end if;
  reading := reading || '{"value":60,"lastModifiedAt":"2026-09-29T10:02:00Z"}';
  input := jsonb_build_object('source',source,'readings',jsonb_build_array(reading));
  result := public.server_ingest_health_batch(u,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('c',64))));
  if (select value_number from public.observations where data_source_id=ds) <> 72 then raise exception 'Older retry overwrote newer value'; end if;
  update public.observations set value_number=88,provenance=provenance||'{"userCorrectedFields":["value_number"]}' where data_source_id=ds;
  reading := reading || '{"value":90,"lastModifiedAt":"2026-09-29T10:12:00Z"}';
  input := jsonb_build_object('source',source,'readings',jsonb_build_array(reading));
  result := public.server_ingest_health_batch(u,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('d',64))));
  if result ? 'error' or (select value_number from public.observations where data_source_id=ds) <> 88 then raise exception 'Manual correction overwritten: %',result; end if;
  select last_sync_at into lastgood from public.data_sources where id=ds;
  -- A valid first record and invalid second record must roll back together.
  input := jsonb_build_object('source',source,'readings',jsonb_build_array(
    reading||'{"externalId":"rollback-valid"}', reading||'{"externalId":"rollback-invalid","value":"bad"}'));
  result := public.server_ingest_health_batch(u,input,jsonb_build_array(
    jsonb_build_object('reading',input->'readings'->0,'revisionKey',repeat('e',64)),
    jsonb_build_object('reading',input->'readings'->1,'revisionKey',repeat('f',64))));
  if not (result ? 'error') then raise exception 'Invalid batch accepted'; end if;
  if exists(select 1 from public.raw_events where data_source_id=ds and external_record_id like 'rollback-%') then raise exception 'Partial raw writes survived failure'; end if;
  if exists(select 1 from public.raw_event_revisions where data_source_id=ds and external_record_id like 'rollback-%') then raise exception 'Partial revision writes survived failure'; end if;
  if (select last_sync_at from public.data_sources where id=ds) is distinct from lastgood then raise exception 'Failure advanced freshness'; end if;
  if (select status from public.source_sync_runs where id=(result->>'syncRunId')::uuid) <> 'failed' then raise exception 'Failed attempt not recorded'; end if;
  -- Historic JSON index keys compare as their SHA-256 digest at equal time.
  update public.raw_events set content_hash='legacy-canonical-json' where id=rawid;
  reading := reading || '{"value":91}';
  input := jsonb_build_object('source',source,'readings',jsonb_build_array(reading));
  result := public.server_ingest_health_batch(u,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('f',64))));
  if result ? 'error' or (result->>'recordsUpdated')::int <> 1 then raise exception 'Legacy key blocked equal-time new revision: %',result; end if;
  if exists(select 1 from public.raw_events where data_source_id=ds and processing_status<>'processed') then raise exception 'Unprocessed health events remain'; end if;
  if has_function_privilege('anon','public.server_ingest_health_batch(uuid,jsonb,jsonb)','execute') or has_function_privilege('authenticated','public.server_ingest_health_batch(uuid,jsonb,jsonb)','execute') then raise exception 'RPC exposed to clients'; end if;
  -- Independent small batches in the same minute must not share a run key.
  source := source || '{"displayName":"__pr38_two_bounded_batches__"}'::jsonb;
  reading := reading || '{"externalId":"batch-1"}'::jsonb;
  input := jsonb_build_object('source',source,'readings',jsonb_build_array(reading));
  result := public.server_ingest_health_batch(u,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('1',64))));
  if result ? 'error' or (result->>'recordsCreated')::int <> 1 then raise exception 'First bounded batch failed: %',result; end if;
  ds := (result->>'dataSourceId')::uuid;
  reading := reading || '{"externalId":"batch-2"}'::jsonb;
  input := jsonb_build_object('source',source,'readings',jsonb_build_array(reading));
  result := public.server_ingest_health_batch(u,input,jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',repeat('2',64))));
  if result ? 'error' or (result->>'recordsCreated')::int <> 1 then raise exception 'Second bounded batch in same minute failed: %',result; end if;
  select count(*) into count_rows from public.source_sync_runs
  where data_source_id=ds and status='completed'
    and metadata->>'syncPurpose'='health_ingestion_batch'
    and metadata->>'runKey'='health_batch:' || id::text;
  if count_rows <> 2 then raise exception 'Health batches did not receive distinct run keys'; end if;
end;
$test$;
set local role authenticated;
do $denied$
begin
  begin
    perform public.server_ingest_health_batch('459ab99b-d99d-492b-bb23-95144dbb1e47','{}','[]');
    raise exception 'Client role unexpectedly executed server-only ingestion';
  exception when insufficient_privilege then null;
  end;
end;
$denied$;
reset role;
select 'PASS: create/retry/newest/stale/correction/rollback/legacy/two bounded batches/denied-role; all test writes rolled back' as health_acceptance;
rollback;
