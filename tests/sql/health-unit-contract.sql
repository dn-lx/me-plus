-- Isolated contract after unit compatibility migration.
do $$
declare oid uuid; row public.observations%rowtype;
begin
 if (select count(*) from public.observations o join unit_cases c on c.observation_id=o.id
     where c.label in ('legacy-oxygen','legacy-energy','legacy-weight','legacy-precision') and o.quality='source' and o.confidence=1 and not(o.provenance?'qualityReason'))<>4
 then raise exception 'valid legacy aliases were not rehabilitated'; end if;
 if not exists(select 1 from public.observations o join unit_cases c on c.observation_id=o.id
   where c.label='legacy-precision' and o.unit='kcal'
   and c.raw_before->'value'='123.1234567890123456789'::jsonb)
 then raise exception 'high precision calorie alias not normalized'; end if;
 if not exists(select 1 from public.observations o join unit_cases c on c.observation_id=o.id where c.label='legacy-zero' and o.unit='kcal'
   and o.quality='accepted_with_warning' and o.confidence=0.6 and o.provenance->>'qualityReason'='zero_energy_value_requires_context')
 then raise exception 'zero energy warning was lost'; end if;
 if (select count(*) from public.observations o join unit_cases c on c.observation_id=o.id where c.label in ('legacy-invalid','legacy-corrected','legacy-history','legacy-raw-mismatch','legacy-owner-mismatch','legacy-source-mismatch')
   and o.unit='percent' and o.quality='rejected_for_decision_use')<>6 then raise exception 'invalid, mismatched or corrected legacy record rewritten'; end if;
 oid:=public.unit_fixture('new-oxygen','oxygen-saturation','percent',98);
 select * into row from public.observations where id=oid;
 if row.unit is distinct from '%' or row.quality is distinct from 'source' then raise exception 'new typed oxygen not normalized'; end if;
 perform public.unit_fixture('new-oxygen','oxygen-saturation','percent',98);
 if (select count(*) from public.raw_events where external_record_id='new-oxygen')<>1 then raise exception 'replay duplicated raw identity'; end if;
 oid:=public.unit_fixture('new-canonical','oxygen-saturation','%',97);
 if not exists(select 1 from public.observations where id=oid and unit='%' and quality='source') then raise exception 'canonical unit regressed'; end if;
 oid:=public.unit_fixture('new-invalid','oxygen-saturation','percent',101);
 if not exists(select 1 from public.observations where id=oid and unit='%' and quality='rejected_for_decision_use') then raise exception 'range gate weakened'; end if;
 oid:=public.unit_fixture('other-provider','oxygen-saturation','percent',98,'fake-health-connect');
 if not exists(select 1 from public.observations where id=oid and unit='percent' and quality='rejected_for_decision_use') then raise exception 'other provider normalized'; end if;
 oid:=public.unit_fixture('wrong-metric','heart-rate','percent',70);
 if not exists(select 1 from public.observations where id=oid and unit='percent' and quality='rejected_for_decision_use') then raise exception 'wrong metric normalized'; end if;
 -- Unit correction remains verbatim, even when it looks like a wire alias.
 update public.observations set provenance=provenance||'{"userCorrectedFields":["unit"]}'::jsonb where id=oid;
 update public.observations set observation_type='oxygen-saturation',unit='percent',value_number=98 where id=oid;
 if not exists(select 1 from public.observations where id=oid and unit='percent') then raise exception 'unit correction overwritten'; end if;
 -- Future timestamps still fail after normalization.
 oid:=public.unit_fixture('future','oxygen-saturation','percent',98);
 update public.observations set observed_at=now()+interval '1 day' where id=oid;
 if not exists(select 1 from public.observations where id=oid and quality='rejected_for_decision_use' and provenance->>'qualityReason'='future_timestamp') then raise exception 'future gate weakened'; end if;
 if exists(select 1 from unit_cases c join public.observations o on o.id=c.observation_id join public.raw_events r on r.id=o.raw_event_id where r.payload is distinct from c.raw_before)
 then raise exception 'raw evidence changed'; end if;
 if has_function_privilege('authenticated','private.normalize_health_connect_observation_unit()','EXECUTE') or
   has_function_privilege('anon','private.normalize_health_connect_observation_unit()','EXECUTE') then raise exception 'client trigger execution allowed'; end if;
end $$;
-- A second migration application must not change any already checked row.
create table unit_after_snapshot as select id,unit,quality,confidence,provenance from public.observations;
