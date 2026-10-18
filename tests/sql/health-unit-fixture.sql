-- Isolated recovered live health-v1 gate: never run fixture on hosted data.
CREATE OR REPLACE FUNCTION private.apply_health_observation_quality_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
end $function$;

create trigger trg_health_observation_quality_v1 before insert or update of domain,observation_type,observed_at,value_number,unit
on public.observations for each row execute function private.apply_health_observation_quality_v1();
create table public.fact_corrections(user_id uuid,entity_type text,entity_id uuid);
create table unit_cases(label text primary key,observation_id uuid,raw_before jsonb);
create function public.unit_fixture(p_label text,metric text,unit_name text,val numeric,provider text default 'health-connect')
returns uuid language plpgsql as $$
declare reading jsonb; result jsonb; oid uuid;
begin
 reading:=jsonb_build_object('externalId',p_label,'metric',metric,'unit',unit_name,'value',val,
   'observedAt','2026-10-17T12:00:00Z','lastModifiedAt','2026-10-17T13:00:00Z',
   'provenance',jsonb_build_object('provider',provider,'sourcePackage','fixture.local'));
 result:=public.server_ingest_health_batch('459ab99b-d99d-492b-bb23-95144dbb1e47',
   jsonb_build_object('source',jsonb_build_object('provider',provider,'displayName','unit-fixture'),'readings',jsonb_build_array(reading)),
   jsonb_build_array(jsonb_build_object('reading',reading,'revisionKey',encode(sha256(convert_to(reading::text,'UTF8')),'hex'))));
 if result ? 'error' then raise exception 'fixture ingestion failed: %',result; end if;
 select o.id into oid from public.observations o join public.raw_events r on r.id=o.raw_event_id where r.external_record_id=p_label;
 insert into unit_cases select p_label,oid,r.payload from public.raw_events r join public.observations o on o.raw_event_id=r.id where o.id=oid
 on conflict(label) do nothing;
 return oid;
end $$;
select public.unit_fixture('legacy-oxygen','oxygen-saturation','percent',98);
select public.unit_fixture('legacy-energy','total-calories-burned','kilocalories',100);
select public.unit_fixture('legacy-precision','total-calories-burned','kilocalories',123.1234567890123456789::numeric);
select public.unit_fixture('legacy-zero','active-calories-burned','kilocalories',0);
select public.unit_fixture('legacy-weight','weight','kilograms',75);
select public.unit_fixture('legacy-invalid','oxygen-saturation','percent',12);
select public.unit_fixture('legacy-corrected','oxygen-saturation','percent',98);
select public.unit_fixture('legacy-history','oxygen-saturation','percent',98);
select public.unit_fixture('legacy-raw-mismatch','oxygen-saturation','percent',98);
update public.observations set value_number=97 where id=(select observation_id from unit_cases where label='legacy-raw-mismatch');
select public.unit_fixture('legacy-owner-mismatch','oxygen-saturation','percent',98);
insert into auth.users values ('86db1e6b-126b-4f46-8a61-f54fae6c22c0');
update public.observations set user_id='86db1e6b-126b-4f46-8a61-f54fae6c22c0' where id=(select observation_id from unit_cases where label='legacy-owner-mismatch');
select public.unit_fixture('legacy-source-mismatch','oxygen-saturation','percent',98);
insert into public.data_sources(user_id,kind,provider,display_name) values ('459ab99b-d99d-492b-bb23-95144dbb1e47','health_sensor','fake-health-connect','mismatch');
update public.observations set data_source_id=(select id from public.data_sources where display_name='mismatch') where id=(select observation_id from unit_cases where label='legacy-source-mismatch');
update public.observations set provenance=provenance||'{"userCorrectedFields":["value_number"],"lastUserCorrectionAt":"2026-10-17T14:00:00Z"}'::jsonb
where id=(select observation_id from unit_cases where label='legacy-corrected');
insert into public.fact_corrections select '459ab99b-d99d-492b-bb23-95144dbb1e47','observation',observation_id from unit_cases where label='legacy-history';
do $$begin
 if (select count(*) from public.observations where quality='rejected_for_decision_use')<>11 then raise exception 'baseline alias bug not reproduced'; end if;
 if not exists(select 1 from unit_cases c join public.observations o on o.id=c.observation_id
   join public.raw_events r on r.id=o.raw_event_id where c.label='legacy-precision'
   and r.payload->'value' is distinct from to_jsonb(o.value_number)
   and (r.payload->>'value')::double precision=o.value_number)
 then raise exception 'numeric roundtrip mismatch not reproduced'; end if;
end $$;
