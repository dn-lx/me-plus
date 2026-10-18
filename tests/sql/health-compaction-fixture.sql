-- Isolated schema additions for the recovered get_health_context contract.
create table public.profiles(id uuid primary key references auth.users(id),timezone text);
insert into public.profiles values ('459ab99b-d99d-492b-bb23-95144dbb1e47','Europe/Berlin');
create table public.derived_features(user_id uuid,feature_key text,as_of timestamptz,value_number double precision,
 value_text text,value_json jsonb,unit text,quality text,method_version text,input_refs jsonb);
create function public.get_health_context(p_user_id uuid,p_as_of timestamptz default now())returns jsonb language sql as $$select '{}'::jsonb$$;
revoke all on function public.get_health_context(uuid,timestamptz)from public,anon,authenticated;
grant execute on function public.get_health_context(uuid,timestamptz)to service_role;
create table compact_test_inputs(label text primary key,reading jsonb,input jsonb,revisions jsonb);
create function public.compact_test_ingest(p_label text,p_value double precision,p_provider text default 'health-connect')
returns uuid language plpgsql as $$
declare reading jsonb;input jsonb;revisions jsonb;result jsonb;oid uuid;
begin
 reading:=jsonb_build_object('externalId',p_label,'metric','heart-rate','unit','bpm','value',p_value,
   'observedAt',now()-interval '10 days','lastModifiedAt',now()-interval '10 days',
   'provenance',jsonb_build_object('provider',p_provider,'sourcePackage','fixture.local','device','watch-a'));
 input:=jsonb_build_object('source',jsonb_build_object('provider',p_provider,'displayName','compaction-fixture'),'readings',jsonb_build_array(reading));
 revisions:=jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',encode(sha256(convert_to(reading::text,'UTF8')),'hex')));
 result:=public.server_ingest_health_batch('459ab99b-d99d-492b-bb23-95144dbb1e47',input,revisions);
 if result?'error' then raise exception 'compaction fixture ingestion failed: %',result;end if;
 oid:=(result->'observationIds'->>0)::uuid;
 insert into compact_test_inputs values(p_label,reading,input,revisions);
 update public.raw_events set received_at=now()-interval '10 days' where id=(select raw_event_id from public.observations where id=oid);
 return oid;
end $$;
