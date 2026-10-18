-- The typed phone/API contract uses percent/kilocalories/kilograms; canonical
-- observations use %/kcal/kg. Preserve raw wire evidence and all gate ranges.
create or replace function private.normalize_health_connect_observation_unit()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
begin
  if new.domain is distinct from 'health'
     or new.provenance->>'provider' is distinct from 'health-connect'
     or coalesce(new.provenance->'userCorrectedFields','[]'::jsonb) ? 'unit'
     or not exists (
       select 1 from public.data_sources ds
       where ds.id=new.data_source_id and ds.user_id=new.user_id
         and ds.provider='health-connect'
     ) then return new; end if;
  new.unit := case
    when new.observation_type='oxygen-saturation' and new.unit='percent' then '%'
    when new.observation_type in ('active-calories-burned','total-calories-burned')
      and new.unit='kilocalories' then 'kcal'
    when new.observation_type='weight' and new.unit='kilograms' then 'kg'
    else new.unit end;
  return new;
end;
$function$;
revoke all on function private.normalize_health_connect_observation_unit()
  from public,anon,authenticated;
drop trigger if exists a_health_connect_units_before_quality on public.observations;
create trigger a_health_connect_units_before_quality
  before insert or update of domain,observation_type,unit on public.observations
  for each row execute function private.normalize_health_connect_observation_unit();

-- Rehabilitate only proven automatic alias rejections. Skip every corrected row,
-- mismatched/raw-less row, invalid value and future timestamp. UPDATE includes
-- unit so the existing quality trigger rechecks (including zero-energy warning).
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
  and r.payload->'value'=to_jsonb(o.value_number)
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
