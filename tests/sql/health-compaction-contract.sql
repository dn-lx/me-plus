select public.compact_test_ingest('packed-a',50);
select public.compact_test_ingest('packed-b',70);
select public.compact_test_ingest('packed-rejected',900);
select public.compact_test_ingest('protected-correction',80);
update public.observations set provenance=provenance||'{"userCorrectedFields":["value_number"]}'::jsonb
where raw_event_id=(select id from public.raw_events where external_record_id='protected-correction');
select public.compact_test_ingest('protected-reference',90);
create table public.compact_external_reference(raw_event_id uuid references public.raw_events(id));
insert into public.compact_external_reference select id from public.raw_events where external_record_id='protected-reference';
select public.compact_test_ingest('other-provider-old',100,'fake-health-connect');
select public.compact_test_ingest('recent-receipt',110);
update public.raw_events set received_at=now()where external_record_id='recent-receipt';
create table compact_raw_before as select id,payload from public.raw_events where external_record_id in ('protected-correction','protected-reference','other-provider-old','recent-receipt');
do $$declare result jsonb;summary public.health_daily_summaries%rowtype;before_digest text;entry compact_test_inputs%rowtype;
begin
 result:=private.compact_health_seven_days();
 if (result->>'compacted_rows')::integer is distinct from 3 then raise exception 'wrong compaction count: %',result;end if;
 select * into summary from public.health_daily_summaries where metric='heart-rate';
 if summary.sample_count is distinct from 3 or summary.usable_count is distinct from 2 or summary.rejected_count is distinct from 1
   or summary.mean is distinct from 60::double precision or summary.minimum is distinct from 50::double precision or summary.maximum is distinct from 70::double precision
 then raise exception 'quality-aware statistics incorrect';end if;
 if exists(select 1 from public.raw_events where external_record_id in('packed-a','packed-b','packed-rejected'))then raise exception 'raw samples retained after compact receipt';end if;
 if exists(select 1 from public.raw_event_revisions where external_record_id in('packed-a','packed-b','packed-rejected'))then raise exception 'redundant raw revisions retained';end if;
 if exists(select 1 from compact_raw_before b left join public.raw_events r using(id)where r.payload is distinct from b.payload)then raise exception 'protected raw fact changed';end if;
 before_digest:=summary.input_digest;
 result:=private.compact_health_seven_days();
 if (result->>'compacted_rows')::integer is distinct from 0 then raise exception 'compaction replay not empty';end if;
 if (select input_digest from public.health_daily_summaries where id=summary.id)is distinct from before_digest then raise exception 'replay changed summary';end if;
 select * into entry from compact_test_inputs where label='packed-a';
 result:=public.server_ingest_health_batch('459ab99b-d99d-492b-bb23-95144dbb1e47',entry.input,entry.revisions);
 if result?'error' or (result->>'recordsCreated')::integer is distinct from 0 then raise exception 'archived replay not deduplicated';end if;
 if exists(select 1 from public.raw_events where external_record_id='packed-a')then raise exception 'archived replay recreated raw data';end if;
 if (select sample_count from public.health_daily_summaries where id=summary.id)is distinct from 3 then raise exception 'archived replay inflated summary';end if;
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
set role authenticated;
do $$begin if exists(select 1 from public.health_daily_summaries)then raise exception 'RLS owner isolation failed';end if;end $$;
reset role;
