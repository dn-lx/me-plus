-- JSON numeric precision can exceed the canonical double column precision.
-- Compare through the same validated cast used by atomic ingestion, not the
-- JSON serialization of its rounded double. All other safety predicates remain.
update public.observations o
set unit=case when o.unit='percent' then '%' when o.unit='kilocalories' then 'kcal' else 'kg' end,
    quality='source', confidence=1,
    provenance=o.provenance - 'qualityReason'
from public.data_sources ds, public.raw_events r
where o.domain='health' and ds.id=o.data_source_id and ds.user_id=o.user_id
  and ds.provider='health-connect' and o.provenance->>'provider'='health-connect'
  and r.id=o.raw_event_id and r.user_id=o.user_id and r.data_source_id=o.data_source_id
  and r.event_type='health-connect.'||o.observation_type
  and r.payload->>'metric'=o.observation_type and r.payload->>'unit'=o.unit
  and jsonb_typeof(r.payload->'value')='number'
  and case when pg_input_is_valid(r.payload->>'value','double precision')
    then (r.payload->>'value')::double precision = o.value_number else false end
  and o.quality='rejected_for_decision_use' and o.confidence=0
  and o.provenance->>'qualityGate'='health-v1'
  and coalesce(o.provenance->'userCorrectedFields','[]'::jsonb)='[]'::jsonb
  and not (o.provenance ? 'lastUserCorrectionAt')
  and not exists (select 1 from public.fact_corrections c
    where c.user_id=o.user_id and c.entity_type='observation' and c.entity_id=o.id)
  and o.observed_at<=now()+interval '10 minutes'
  and o.value_number>'-Infinity'::double precision and o.value_number<'Infinity'::double precision
  and (
    (o.observation_type='oxygen-saturation' and o.unit='percent'
      and o.value_number between 50 and 100
      and o.provenance->>'qualityReason'='invalid_oxygen_saturation_unit_or_range')
    or (o.observation_type in ('active-calories-burned','total-calories-burned')
      and o.unit='kilocalories' and o.value_number>=0
      and o.provenance->>'qualityReason'='invalid_energy_unit_or_range')
    or (o.observation_type='weight' and o.unit='kilograms'
      and o.value_number between 20 and 500
      and o.provenance->>'qualityReason'='invalid_weight_unit_or_range')
  );

