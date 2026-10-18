select public.compact_test_ingest('packed-a',50);
select public.compact_test_ingest('packed-b',70);
update public.observations set quality='accepted_with_warning',confidence=0.4
where raw_event_id=(select id from public.raw_events where external_record_id='packed-b');
select public.compact_test_ingest('packed-rejected',900);
select public.compact_test_ingest('protected-correction',80);
update public.observations set provenance=provenance||'{"userCorrectedFields":["value_number"]}'::jsonb
where raw_event_id=(select id from public.raw_events where external_record_id='protected-correction');
select public.compact_test_ingest('protected-reference',90);
create table public.compact_external_reference(raw_event_id uuid references public.raw_events(id));
insert into public.compact_external_reference select id from public.raw_events where external_record_id='protected-reference';
select public.compact_test_ingest('protected-observation-reference',85);
create table public.compact_observation_reference(observation_id uuid references public.observations(id) on delete cascade);
insert into public.compact_observation_reference select id from public.observations
where raw_event_id=(select id from public.raw_events where external_record_id='protected-observation-reference');
select public.compact_test_ingest('other-provider-old',100,'fake-health-connect');
select public.compact_test_ingest('recent-receipt',110);
update public.raw_events set received_at=now()where external_record_id='recent-receipt';
create table compact_raw_before as select id,payload from public.raw_events where external_record_id in ('protected-correction','protected-reference','protected-observation-reference','other-provider-old','recent-receipt');
do $$declare result jsonb;summary public.health_daily_summaries%rowtype;before_digest text;entry compact_test_inputs%rowtype;
 bad_limit integer; replay_reading jsonb; newer_reading jsonb; invalid_reading jsonb;
 last_good timestamptz;
begin
 foreach bad_limit in array array[null,0,10001]::integer[] loop
  begin
   perform private.compact_health_seven_days(bad_limit);
   raise exception 'invalid compaction limit accepted: %',bad_limit;
  exception when raise_exception then
   if sqlerrm<>'invalid_compaction_limit' then raise;end if;
  end;
 end loop;
 result:=private.compact_health_seven_days();
 if (result->>'compacted_rows')::integer is distinct from 3 then raise exception 'wrong compaction count: %',result;end if;
 if (result->>'failed_sources')::integer is distinct from 0 then raise exception 'unexpected compaction source failure: %',result;end if;
 select * into summary from public.health_daily_summaries where metric='heart-rate';
 if summary.sample_count is distinct from 3 or summary.usable_count is distinct from 2 or summary.rejected_count is distinct from 1
   or summary.mean is distinct from 60::double precision or summary.minimum is distinct from 50::double precision or summary.maximum is distinct from 70::double precision
 then raise exception 'quality-aware statistics incorrect';end if;
 if exists(select 1 from public.raw_events where external_record_id in('packed-a','packed-b','packed-rejected'))then raise exception 'raw samples retained after compact receipt';end if;
 if exists(select 1 from public.raw_event_revisions where external_record_id in('packed-a','packed-b','packed-rejected'))then raise exception 'redundant raw revisions retained';end if;
 if exists(select 1 from compact_raw_before b left join public.raw_events r using(id)where r.payload is distinct from b.payload)then raise exception 'protected raw fact changed';end if;
 if (select count(*) from public.compact_observation_reference)<>1 then raise exception 'observation cascade reference was deleted';end if;
 if not exists(select 1 from public.audit_events where event_type='health_seven_day_compaction'
   and entity_id=summary.data_source_id and metadata->>'method_version'='health-7d-packed-v1'
   and (metadata->>'observations_deleted')::integer=3 and (metadata->>'raw_events_deleted')::integer=3
   and (metadata->>'raw_event_revisions_deleted')::integer=3 and metadata->'summary_ids'?summary.id::text)
 then raise exception 'compaction audit counts or summary provenance missing';end if;
 if not exists(select 1 from public.compact_test_heartbeats where scheduler_key='health_seven_day_compaction:'||summary.data_source_id::text
   and status='completed' and expected_cadence_minutes=1440 and allowed_lateness_minutes=120)
 then raise exception 'compaction completion heartbeat missing';end if;
 if public.get_health_context('459ab99b-d99d-492b-bb23-95144dbb1e47',summary.last_usable_at)->'latest'->'heart-rate'->>'quality'
   is distinct from 'accepted_with_warning'
  or (public.get_health_context('459ab99b-d99d-492b-bb23-95144dbb1e47',summary.last_usable_at)->'latest'->'heart-rate'->>'confidence')::numeric
   is distinct from 0.4::numeric
 then raise exception 'compacted fallback inflated quality or confidence';end if;
 before_digest:=summary.input_digest;
 result:=private.compact_health_seven_days();
 if (result->>'compacted_rows')::integer is distinct from 0 then raise exception 'compaction replay not empty';end if;
 if (select input_digest from public.health_daily_summaries where id=summary.id)is distinct from before_digest then raise exception 'replay changed summary';end if;
 select * into entry from compact_test_inputs where label='packed-a';
 result:=public.server_ingest_health_batch('459ab99b-d99d-492b-bb23-95144dbb1e47',entry.input,entry.revisions);
 if result?'error' or (result->>'recordsCreated')::integer is distinct from 0 then raise exception 'archived replay not deduplicated';end if;
 if exists(select 1 from public.raw_events where external_record_id='packed-a')then raise exception 'archived replay recreated raw data';end if;
 if (select sample_count from public.health_daily_summaries where id=summary.id)is distinct from 3 then raise exception 'archived replay inflated summary';end if;
 -- Stale revisions and equal-time lower-key revisions remain archived too.
 foreach replay_reading in array array[
  entry.reading||jsonb_build_object('value',45,'lastModifiedAt',(entry.reading->>'lastModifiedAt')::timestamptz-interval '1 second'),
  entry.reading||jsonb_build_object('value',46)
 ] loop
  result:=public.server_ingest_health_batch('459ab99b-d99d-492b-bb23-95144dbb1e47',
   jsonb_set(entry.input,'{readings}',jsonb_build_array(replay_reading)),
   jsonb_build_array(jsonb_build_object('reading',replay_reading,'revisionKey',repeat('0',64))));
  if result?'error' or (result->>'recordsCreated')::integer is distinct from 0 then raise exception 'stale/equal archived replay accepted: %',result;end if;
 end loop;
 if exists(select 1 from public.raw_events where external_record_id='packed-a')
  or exists(select 1 from public.raw_event_revisions where external_record_id='packed-a')
  or (select input_digest from public.health_daily_summaries where id=summary.id)is distinct from before_digest
 then raise exception 'stale/equal replay changed compacted evidence';end if;
 -- Removing an archived contribution must roll back with a later bad reading.
 newer_reading:=entry.reading||jsonb_build_object('value',80,'lastModifiedAt',now()-interval '9 days');
 invalid_reading:=newer_reading||jsonb_build_object('externalId','zz-rollback-invalid','value','bad');
 select last_sync_at into last_good from public.data_sources where id=summary.data_source_id;
 result:=public.server_ingest_health_batch('459ab99b-d99d-492b-bb23-95144dbb1e47',
  jsonb_set(entry.input,'{readings}',jsonb_build_array(newer_reading,invalid_reading)),
  jsonb_build_array(
   jsonb_build_object('reading',newer_reading,'revisionKey',encode(sha256(convert_to(newer_reading::text,'UTF8')),'hex')),
   jsonb_build_object('reading',invalid_reading,'revisionKey',encode(sha256(convert_to(invalid_reading::text,'UTF8')),'hex'))));
 if not(result?'error') then raise exception 'invalid late revision batch accepted';end if;
 if (select input_digest from public.health_daily_summaries where id=summary.id)is distinct from before_digest
  or not exists(select 1 from public.health_daily_summaries where id=summary.id and sample_count=3 and mean=60)
 then raise exception 'failed late revision changed archived contribution';end if;
 if exists(select 1 from public.raw_events where external_record_id in('packed-a','zz-rollback-invalid'))
  or exists(select 1 from public.raw_event_revisions where external_record_id in('packed-a','zz-rollback-invalid'))
 then raise exception 'failed late revision retained partial raw evidence';end if;
 if (select last_sync_at from public.data_sources where id=summary.data_source_id)is distinct from last_good
  or not exists(select 1 from public.source_sync_runs where id=(result->>'syncRunId')::uuid and status='failed')
 then raise exception 'failed late revision advanced freshness or lost failure record';end if;
 -- A newer revision replaces its old contribution atomically, then rejoins the
 -- same summary after its raw receipt retention window has elapsed.
 entry.reading:=entry.reading||jsonb_build_object('value',80,'lastModifiedAt',now()-interval '9 days');
 entry.input:=jsonb_set(entry.input,'{readings}',jsonb_build_array(entry.reading));
 entry.revisions:=jsonb_build_array(jsonb_build_object('reading',entry.reading,'revisionKey',encode(sha256(convert_to(entry.reading::text,'UTF8')),'hex')));
 result:=public.server_ingest_health_batch('459ab99b-d99d-492b-bb23-95144dbb1e47',entry.input,entry.revisions);
 if result?'error' then raise exception 'late revision failed: %',result;end if;
 if (select mean from public.health_daily_summaries where id=summary.id)is distinct from 70::double precision then raise exception 'old contribution retained';end if;
 update public.raw_events set received_at=now()-interval '9 days'where external_record_id='packed-a';
 perform private.compact_health_seven_days();
 if not exists(select 1 from public.health_daily_summaries where id=summary.id and mean=75 and sample_count=3)then raise exception 'late revision double counted';end if;
 if not(public.get_health_context('459ab99b-d99d-492b-bb23-95144dbb1e47')?'compacted_daily')then raise exception 'context lost compacted history';end if;
 if jsonb_array_length(public.get_health_context('459ab99b-d99d-492b-bb23-95144dbb1e47')->'compacted_daily')<>1 then raise exception 'context compacted source coverage missing';end if;
 if has_function_privilege('authenticated','private.compact_health_seven_days(integer)','EXECUTE') or has_function_privilege('anon','private.health_compacted_revision_handled(uuid,uuid,jsonb,text)','EXECUTE')then raise exception 'compaction privilege exposed';end if;
end $$;
-- An error after receipt aggregation must restore raw facts and the old summary,
-- while recording a sanitized failure outside the per-source subtransaction.
select public.compact_test_ingest('failure-atomic',65);
create table compact_failure_before as select s.id,s.input_digest from public.health_daily_summaries s;
create function public.compact_test_force_summary_failure() returns trigger language plpgsql as $$
begin
 if new.data_source_id=(select data_source_id from public.raw_events where external_record_id='failure-atomic') then
  raise exception 'fixture payload must not enter audit metadata';
 end if;
 return new;
end $$;
create trigger compact_test_force_summary_failure before insert or update on public.health_daily_summaries
for each row execute function public.compact_test_force_summary_failure();
do $$declare result jsonb;source_id uuid;
begin
 select data_source_id into source_id from public.raw_events where external_record_id='failure-atomic';
 result:=private.compact_health_seven_days();
 if (result->>'compacted_rows')::integer is distinct from 0 or (result->>'failed_sources')::integer is distinct from 1
 then raise exception 'failed source not isolated: %',result;end if;
 if not exists(select 1 from public.observations o join public.raw_events r on r.id=o.raw_event_id
   join public.raw_event_revisions rev on rev.data_source_id=r.data_source_id and rev.external_record_id=r.external_record_id
   where r.external_record_id='failure-atomic')
 then raise exception 'failed compaction deleted raw evidence';end if;
 if exists(select 1 from compact_failure_before b left join public.health_daily_summaries s using(id)
   where s.input_digest is distinct from b.input_digest)
 then raise exception 'failed compaction changed existing summary';end if;
 if not exists(select 1 from public.audit_events where event_type='health_seven_day_compaction_failed'
   and entity_id=source_id and metadata->>'error_code'='P0001'
   and metadata::text not like '%fixture payload%')
 then raise exception 'sanitized failure audit missing';end if;
 if not exists(select 1 from public.compact_test_heartbeats where scheduler_key='health_seven_day_compaction:'||source_id::text
   and status='failed' and error='{"error_code":"P0001"}'::jsonb)
 then raise exception 'sanitized failure heartbeat missing';end if;
end $$;
drop trigger compact_test_force_summary_failure on public.health_daily_summaries;
drop function public.compact_test_force_summary_failure();
set role authenticated;
do $$begin if exists(select 1 from public.health_daily_summaries)then raise exception 'RLS owner isolation failed';end if;end $$;
reset role;
