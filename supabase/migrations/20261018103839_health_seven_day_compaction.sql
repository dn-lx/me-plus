-- Owner-approved 7-day high-frequency Health Connect compaction. Sparse domain
-- facts and any corrected/referenced evidence remain canonical rows. Raw provider
-- payloads are removed only after a compact numeric/provenance receipt and daily
-- summary are atomically written; no external archive retains raw payload copies.
create table if not exists public.health_storage_policies (
  user_id uuid primary key references auth.users(id) on delete cascade,
  raw_days integer not null default 7 check(raw_days=7),
  enabled boolean not null default false,
  last_compacted_at timestamptz,
  last_compacted_rows integer not null default 0
);
alter table public.health_storage_policies enable row level security;
revoke all on public.health_storage_policies from public,anon,authenticated;
grant select on public.health_storage_policies to authenticated;
grant all on public.health_storage_policies to service_role;
drop policy if exists health_storage_owner_read on public.health_storage_policies;
create policy health_storage_owner_read on public.health_storage_policies for select to authenticated
  using ((select auth.uid())=user_id);

create table if not exists private.health_compaction_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  local_day date not null, timezone text not null,
  metric text not null check(metric in ('heart-rate','oxygen-saturation')),
  unit text not null, source_package text not null, device text not null,
  entries jsonb not null check(jsonb_typeof(entries)='object'),
  updated_at timestamptz not null default now(),
  unique(user_id,data_source_id,local_day,timezone,metric,unit,source_package,device)
);
alter table private.health_compaction_receipts enable row level security;
revoke all on private.health_compaction_receipts from public,anon,authenticated;
grant all on private.health_compaction_receipts to service_role;
grant usage on schema private to service_role;
create index if not exists health_compaction_identity_lookup on private.health_compaction_receipts using gin(entries);
create index if not exists health_compaction_owner_source on private.health_compaction_receipts(user_id,data_source_id);

create table if not exists public.health_daily_summaries (
  id uuid primary key references private.health_compaction_receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  local_day date not null, timezone text not null, metric text not null,unit text not null,
  source_package text not null,device text not null,
  sample_count integer not null,usable_count integer not null,rejected_count integer not null,
  minimum double precision,maximum double precision,mean double precision,
  first_at timestamptz,last_at timestamptz,last_value double precision,last_usable_at timestamptz,
  last_quality text,last_confidence numeric,
  input_digest text not null,method_version text not null default 'health-7d-packed-v1',
  updated_at timestamptz not null default now()
);
alter table public.health_daily_summaries enable row level security;
revoke all on public.health_daily_summaries from public,anon,authenticated;
grant select on public.health_daily_summaries to authenticated;
grant all on public.health_daily_summaries to service_role;
drop policy if exists health_summary_owner_read on public.health_daily_summaries;
create policy health_summary_owner_read on public.health_daily_summaries for select to authenticated
  using ((select auth.uid())=user_id);
create index if not exists health_summary_owner_time on public.health_daily_summaries(user_id,local_day desc);

create or replace function private.refresh_health_compaction_summary(p_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare r private.health_compaction_receipts%rowtype;
begin
  select * into r from private.health_compaction_receipts where id=p_id for update;
  if not found then return; end if;
  if r.entries='{}'::jsonb then delete from private.health_compaction_receipts where id=p_id;return;end if;
  insert into public.health_daily_summaries(id,user_id,data_source_id,local_day,timezone,metric,unit,source_package,device,
    sample_count,usable_count,rejected_count,minimum,maximum,mean,first_at,last_at,last_value,last_usable_at,last_quality,last_confidence,input_digest)
  select r.id,r.user_id,r.data_source_id,r.local_day,r.timezone,r.metric,r.unit,r.source_package,r.device,
    count(*)::integer,count(*)filter(where usable)::integer,count(*)filter(where not usable)::integer,
    min(value)filter(where usable),max(value)filter(where usable),avg(value)filter(where usable),
    min(at),max(at),(array_agg(value order by at desc,identity_key)filter(where usable))[1],
    max(at)filter(where usable),
    (array_agg(quality order by at desc,identity_key)filter(where usable))[1],
    (array_agg(confidence order by at desc,identity_key)filter(where usable))[1],
    encode(sha256(convert_to(r.entries::text,'UTF8')),'hex')
  from (select key identity_key,(value->>'value')::double precision value,(value->>'observedAt')::timestamptz at,
    coalesce(value->>'quality','source') quality,(value->>'confidence')::numeric confidence,
    coalesce(value->>'quality','source') in ('source','accepted','accepted_with_warning') usable
    from jsonb_each(r.entries)) s
  on conflict(id)do update set sample_count=excluded.sample_count,usable_count=excluded.usable_count,
    rejected_count=excluded.rejected_count,minimum=excluded.minimum,maximum=excluded.maximum,mean=excluded.mean,
    first_at=excluded.first_at,last_at=excluded.last_at,last_value=excluded.last_value,last_usable_at=excluded.last_usable_at,
    last_quality=excluded.last_quality,last_confidence=excluded.last_confidence,
    input_digest=excluded.input_digest,updated_at=clock_timestamp();
end $$;

-- Ordinary provider replays must not recreate compacted rows. A newer revision
-- removes the prior contribution before normal atomic ingestion replaces it.
create or replace function private.health_compacted_revision_handled(p_user uuid,p_source uuid,p_reading jsonb,p_key text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare receipt private.health_compaction_receipts%rowtype; identity_key text; old_entry jsonb;
begin
  identity_key:=encode(sha256(convert_to(p_source::text||':'||(p_reading->>'externalId'),'UTF8')),'hex');
  select * into receipt from private.health_compaction_receipts
    where user_id=p_user and data_source_id=p_source and entries ? identity_key for update;
  if not found then return false; end if;
  old_entry:=receipt.entries->identity_key;
  if p_key=old_entry->>'revisionKey' or
    ((p_reading->>'lastModifiedAt')::timestamptz,(p_reading->>'observedAt')::timestamptz,p_key collate "C") <=
    ((old_entry->>'lastModifiedAt')::timestamptz,(old_entry->>'observedAt')::timestamptz,(old_entry->>'revisionKey') collate "C")
  then return true; end if;
  update private.health_compaction_receipts set entries=entries-identity_key,updated_at=clock_timestamp() where id=receipt.id;
  perform private.refresh_health_compaction_summary(receipt.id);
  return false;
end $$;

-- Protect all relational evidence outside the candidate observation itself,
-- including future tables: discover real FK columns rather than guessing names.
create or replace function private.health_raw_has_other_references(p_raw uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare fk record; present boolean;
begin
  for fk in select n.nspname,c.relname,a.attname
    from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join lateral unnest(k.conkey,k.confkey) u(local_column,foreign_column)
    join pg_catalog.pg_attribute a on a.attrelid=k.conrelid and a.attnum=u.local_column
    join pg_catalog.pg_attribute target on target.attrelid=k.confrelid and target.attnum=u.foreign_column
    where k.contype='f' and k.confrelid='public.raw_events'::regclass and target.attname='id'
      and k.conrelid<>'public.observations'::regclass
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)',fk.nspname,fk.relname,fk.attname) into present using p_raw;
    if present then return true;end if;
  end loop;
  return false;
end $$;

-- Observation-only FK children need protection even when they do not also
-- reference raw_events. In particular, never cascade-delete future evidence.
create or replace function private.health_observation_has_references(p_observation uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare fk record; present boolean;
begin
  for fk in select n.nspname,c.relname,a.attname
    from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join lateral unnest(k.conkey,k.confkey) u(local_column,foreign_column)
    join pg_catalog.pg_attribute a on a.attrelid=k.conrelid and a.attnum=u.local_column
    join pg_catalog.pg_attribute target on target.attrelid=k.confrelid and target.attnum=u.foreign_column
    where k.contype='f' and k.confrelid='public.observations'::regclass and target.attname='id'
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)',fk.nspname,fk.relname,fk.attname) into present using p_observation;
    if present then return true;end if;
  end loop;
  return false;
end $$;

create or replace function private.compact_health_seven_days(p_limit integer default 5000)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare source record; group_row record; candidate jsonb; receipt_id uuid; total integer:=0; cutoff timestamptz;
  observation_count integer;raw_count integer;revision_count integer;summary_ids jsonb;
  failures integer:=0;error_state text;
begin
  if p_limit is null or p_limit<1 or p_limit>10000 then raise exception 'invalid_compaction_limit';end if;
  for source in select ds.id,ds.user_id,coalesce(p.timezone,'UTC') timezone
    from public.data_sources ds join public.health_storage_policies hp on hp.user_id=ds.user_id and hp.enabled
    join public.profiles p on p.id=ds.user_id where ds.provider='health-connect'
  loop
    perform pg_advisory_xact_lock(hashtextextended(source.user_id::text||':'||source.id::text,0));
    perform public.record_scheduler_heartbeat(source.user_id,'health_seven_day_compaction:'||source.id::text,'invoked','health-7d-packed-v1',null,1440,120,null,'supabase:health_seven_day_compaction');
    -- Each source is atomic. Failed writes/deletions roll back before recording
    -- sanitized failure evidence; another source can still make progress.
    begin
    summary_ids:='[]'::jsonb;
    cutoff:=date_trunc('day',(clock_timestamp()-interval '7 days') at time zone source.timezone) at time zone source.timezone;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb) into candidate from (
      select o.id observation_id,r.id raw_id,r.external_record_id,
        (o.observed_at at time zone source.timezone)::date local_day,o.observation_type metric,o.unit,
        coalesce(o.provenance->>'sourcePackage','unknown') source_package,coalesce(o.provenance->>'device','unknown') device,
        encode(sha256(convert_to(source.id::text||':'||r.external_record_id,'UTF8')),'hex') identity_key,
        jsonb_build_object('observationId',o.id,'rawId',r.id,'revisionKey',r.content_hash,
          'lastModifiedAt',o.provenance->>'lastModifiedAt','observedAt',o.observed_at,
          'value',o.value_number,'quality',o.quality,'confidence',o.confidence) entry
      from public.observations o join public.raw_events r on r.id=o.raw_event_id and r.user_id=o.user_id and r.data_source_id=o.data_source_id
      where o.user_id=source.user_id and o.data_source_id=source.id and o.domain='health'
        and o.observation_type in ('heart-rate','oxygen-saturation') and o.value_number is not null
        and o.value_number>'-Infinity'::double precision and o.value_number<'Infinity'::double precision
        and o.observed_at<cutoff and r.received_at<cutoff
        and case when pg_input_is_valid(o.provenance->>'lastModifiedAt','timestamp with time zone')
          then (o.provenance->>'lastModifiedAt')::timestamptz<cutoff else false end
        and r.content_hash~'^[a-f0-9]{64}$' and r.external_record_id is not null
        and r.processing_status='processed' and r.payload->>'metric'=o.observation_type
        and o.provenance->>'providerRevisionKey'=r.content_hash
        and o.provenance->>'lastModifiedAt'=r.payload->>'lastModifiedAt'
        and case when pg_input_is_valid(r.payload->>'value','double precision')
          then (r.payload->>'value')::double precision=o.value_number else false end
        and o.provenance->>'provider'='health-connect'
        and coalesce(o.provenance->'userCorrectedFields','[]'::jsonb)='[]'::jsonb
        and not(o.provenance?'lastUserCorrectionAt')
        and not exists(select 1 from public.fact_corrections fc where fc.user_id=o.user_id and fc.entity_type='observation' and fc.entity_id=o.id)
        and not exists(select 1 from public.observations sibling where sibling.raw_event_id=r.id and sibling.id<>o.id)
        and not private.health_raw_has_other_references(r.id)
        and not private.health_observation_has_references(o.id)
      order by o.observed_at,o.id limit p_limit for update of o,r skip locked
    ) rows;
    for group_row in select (x->>'local_day')::date local_day,x->>'metric' metric,x->>'unit' unit,x->>'source_package' source_package,
      x->>'device' device,jsonb_object_agg(x->>'identity_key',x->'entry') entries
      from jsonb_array_elements(candidate)x group by 1,2,3,4,5
    loop
      insert into private.health_compaction_receipts(user_id,data_source_id,local_day,timezone,metric,unit,source_package,device,entries)
      values(source.user_id,source.id,group_row.local_day,source.timezone,group_row.metric,group_row.unit,group_row.source_package,group_row.device,group_row.entries)
      on conflict(user_id,data_source_id,local_day,timezone,metric,unit,source_package,device)do update
        set entries=private.health_compaction_receipts.entries||excluded.entries,updated_at=clock_timestamp()
      returning id into receipt_id;
      perform private.refresh_health_compaction_summary(receipt_id);
      summary_ids:=summary_ids||jsonb_build_array(receipt_id);
    end loop;
    delete from public.observations o where o.id in(select (x->>'observation_id')::uuid from jsonb_array_elements(candidate)x);
    get diagnostics observation_count=row_count;
    delete from public.raw_event_revisions rev using public.raw_events r
      where r.id in(select (x->>'raw_id')::uuid from jsonb_array_elements(candidate)x)
        and rev.user_id=r.user_id and rev.data_source_id=r.data_source_id and rev.external_record_id=r.external_record_id;
    get diagnostics revision_count=row_count;
    delete from public.raw_events r where r.id in(select (x->>'raw_id')::uuid from jsonb_array_elements(candidate)x);
    get diagnostics raw_count=row_count;
    if observation_count<>jsonb_array_length(candidate) or raw_count<>observation_count then
      raise exception 'health_compaction_delete_count_mismatch';
    end if;
    insert into public.audit_events(user_id,actor_type,event_type,entity_type,entity_id,occurred_at,metadata)
    values(source.user_id,'system','health_seven_day_compaction','data_source',source.id,clock_timestamp(),
      jsonb_build_object('data_source_id',source.id,'cutoff_at',cutoff,'timezone',source.timezone,
        'method_version','health-7d-packed-v1','raw_days',7,'observations_deleted',observation_count,
        'raw_events_deleted',raw_count,'raw_event_revisions_deleted',revision_count,'summary_ids',summary_ids));
    perform public.record_scheduler_heartbeat(source.user_id,'health_seven_day_compaction:'||source.id::text,
      case when observation_count=0 then 'no_op' else 'completed' end,'health-7d-packed-v1',null,1440,120,null,'supabase:health_seven_day_compaction');
    update public.health_storage_policies set last_compacted_at=clock_timestamp(),last_compacted_rows=jsonb_array_length(candidate) where user_id=source.user_id;
    total:=total+jsonb_array_length(candidate);
    exception when others then
      get stacked diagnostics error_state=returned_sqlstate;
      failures:=failures+1;
      insert into public.audit_events(user_id,actor_type,event_type,entity_type,entity_id,occurred_at,metadata)
      values(source.user_id,'system','health_seven_day_compaction_failed','data_source',source.id,clock_timestamp(),
        jsonb_build_object('data_source_id',source.id,'cutoff_at',cutoff,'method_version','health-7d-packed-v1','error_code',error_state));
      perform public.record_scheduler_heartbeat(source.user_id,'health_seven_day_compaction:'||source.id::text,'failed','health-7d-packed-v1',
        jsonb_build_object('error_code',error_state),1440,120,null,'supabase:health_seven_day_compaction');
    end;
  end loop;
  return jsonb_build_object('compacted_rows',total,'failed_sources',failures,'raw_days',7,'method','health-7d-packed-v1');
end $$;

revoke all on function private.refresh_health_compaction_summary(uuid),private.health_compacted_revision_handled(uuid,uuid,jsonb,text),
  private.health_raw_has_other_references(uuid),private.health_observation_has_references(uuid),private.compact_health_seven_days(integer) from public,anon,authenticated;
grant execute on function private.refresh_health_compaction_summary(uuid),private.health_compacted_revision_handled(uuid,uuid,jsonb,text),
  private.health_raw_has_other_references(uuid),private.health_observation_has_references(uuid),private.compact_health_seven_days(integer) to service_role;

-- The owner authorized this policy for the existing single-owner project only.
-- Future profiles are not silently opted in.
insert into public.health_storage_policies(user_id,enabled)
select id,true from public.profiles where (select count(*)from public.profiles)=1
on conflict(user_id)do nothing;

-- Extend existing service-owned ingestion and bounded context without changing ACLs.
CREATE OR REPLACE FUNCTION public.server_ingest_health_batch(p_user_id uuid, p_input jsonb, p_revisions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
      if private.health_compacted_revision_handled(p_user_id,v_source_id,v_reading,v_key) then continue; end if;
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
      if private.health_compacted_revision_handled(p_user_id,v_source_id,v_reading,v_key) then
        v_ignored:=v_ignored+1;continue;
      end if;
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_health_context(p_user_id uuid, p_as_of timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_timezone text;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_latest jsonb;
  v_daily jsonb;
  v_quality jsonb;
  v_sources jsonb;
  v_body_state jsonb;
  v_compacted jsonb; v_summary record;
begin
  select coalesce(timezone,'UTC')
  into v_timezone
  from public.profiles
  where id = p_user_id;

  v_timezone := coalesce(v_timezone,'UTC');
  v_day_start := date_trunc('day', p_as_of at time zone v_timezone) at time zone v_timezone;
  v_day_end := v_day_start + interval '1 day';

  with recursive metric_types(observation_type) as (
    select (
      select o.observation_type
      from public.observations o
      where o.user_id = p_user_id
        and o.domain = 'health'
        and o.observed_at <= p_as_of
        and o.observed_at >= p_as_of - interval '14 days'
        and coalesce(o.quality,'accepted') not in
          ('rejected','rejected_for_decision_use','corrected/superseded')
      order by o.observation_type
      limit 1
    )
    union all
    select (
      select o.observation_type
      from public.observations o
      where o.user_id = p_user_id
        and o.domain = 'health'
        and o.observed_at <= p_as_of
        and o.observed_at >= p_as_of - interval '14 days'
        and coalesce(o.quality,'accepted') not in
          ('rejected','rejected_for_decision_use','corrected/superseded')
        and o.observation_type > mt.observation_type
      order by o.observation_type
      limit 1
    )
    from metric_types mt
    where mt.observation_type is not null
  ),
  nonweight as (
    select pick.*
    from metric_types mt
    cross join lateral (
      select
        o.observation_type,
        o.observed_at,
        o.value_number,
        o.value_text,
        o.unit,
        o.quality,
        o.confidence,
        ds.provider,
        ds.display_name
      from (
        select o1.observed_at
        from public.observations o1
        where mt.observation_type is not null
          and mt.observation_type <> 'weight'
          and o1.user_id = p_user_id
          and o1.domain = 'health'
          and o1.observation_type = mt.observation_type
          and o1.observed_at <= p_as_of
          and o1.observed_at >= p_as_of - interval '14 days'
          and coalesce(o1.quality,'accepted') not in
            ('rejected','rejected_for_decision_use','corrected/superseded')
        order by o1.observed_at desc
        limit 1
      ) latest_ts
      join public.observations o
        on o.user_id = p_user_id
       and o.domain = 'health'
       and o.observation_type = mt.observation_type
       and o.observed_at = latest_ts.observed_at
       and coalesce(o.quality,'accepted') not in
         ('rejected','rejected_for_decision_use','corrected/superseded')
      left join public.data_sources ds on ds.id = o.data_source_id
      order by case ds.provider
        when 'health-connect' then 1
        when 'google-drive-healthsync' then 2
        else 3
      end
      limit 1
    ) pick
  ),
  weight as (
    select
      o.observation_type,
      o.observed_at,
      o.value_number,
      o.value_text,
      o.unit,
      o.quality,
      o.confidence,
      ds.provider,
      ds.display_name
    from public.observations o
    left join public.data_sources ds on ds.id = o.data_source_id
    where o.user_id = p_user_id
      and o.domain = 'health'
      and o.observation_type = 'weight'
      and o.observed_at <= p_as_of
      and o.observed_at >= p_as_of - interval '14 days'
      and coalesce(o.quality,'accepted') not in
        ('rejected','rejected_for_decision_use','corrected/superseded')
    order by
      case when ds.provider in ('health-connect','google-drive-healthsync') then 0 else 1 end,
      o.observed_at desc,
      case ds.provider
        when 'health-connect' then 1
        when 'google-drive-healthsync' then 2
        else 3
      end
    limit 1
  ),
  picked as (
    select * from nonweight
    union all
    select * from weight
  )
  select coalesce(
    jsonb_object_agg(
      q.observation_type,
      jsonb_build_object(
        'observed_at', q.observed_at,
        'value_number', q.value_number,
        'value_text', q.value_text,
        'unit', q.unit,
        'quality', q.quality,
        'confidence', q.confidence,
        'provider', q.provider,
        'source', q.display_name
      )
    ),
    '{}'::jsonb
  )
  into v_latest
  from (
    select *
    from picked
    order by observed_at desc
    limit 50
  ) q;

  select coalesce(
    jsonb_object_agg(
      f.feature_key,
      jsonb_build_object(
        'as_of', f.as_of,
        'value_number', f.value_number,
        'value_text', f.value_text,
        'value_json', f.value_json,
        'unit', f.unit,
        'quality', f.quality,
        'method_version', f.method_version,
        'input_refs', f.input_refs
      )
    ),
    '{}'::jsonb
  )
  into v_body_state
  from (
    select distinct on (df.feature_key)
      df.feature_key,
      df.as_of,
      df.value_number,
      df.value_text,
      df.value_json,
      df.unit,
      df.quality,
      df.method_version,
      df.input_refs
    from public.derived_features df
    where df.user_id = p_user_id
      and df.feature_key in (
        'waist-to-height-ratio',
        'body-composition-visual-assessment',
        'body-fat-percentage-estimate',
        'body-fat-mass-estimate',
        'fat-free-mass-estimate'
      )
      and df.as_of <= p_as_of
      and df.as_of >= p_as_of - interval '90 days'
    order by df.feature_key, df.as_of desc
  ) f;

  select coalesce(jsonb_agg(jsonb_build_object(
    'metric',x.observation_type,
    'provider',x.provider,
    'source',x.display_name,
    'value',x.total_value,
    'unit',x.unit,
    'samples',x.samples,
    'first_at',x.first_at,
    'last_at',x.last_at,
    'quality',x.quality,
    'aggregation',x.aggregation
  ) order by x.observation_type,x.provider),'[]'::jsonb)
  into v_daily
  from (
    select
      o.observation_type,
      ds.provider,
      ds.display_name,
      o.unit,
      sum(o.value_number) total_value,
      count(*) samples,
      min(o.observed_at) first_at,
      max(o.observed_at) last_at,
      case when bool_or(o.quality='accepted_with_warning') then 'accepted_with_warning' else 'accepted' end quality,
      'sum'::text aggregation
    from public.observations o
    left join public.data_sources ds on ds.id=o.data_source_id
    where o.user_id=p_user_id
      and o.domain='health'
      and o.observed_at>=v_day_start
      and o.observed_at<least(v_day_end,p_as_of+interval '1 second')
      and o.observation_type in
        ('active-calories-burned','resting-calories-burned','total-calories-burned')
      and o.value_number is not null
      and coalesce(o.quality,'accepted') not in
        ('suspect','rejected','rejected_for_decision_use','corrected/superseded')
    group by o.observation_type,ds.provider,ds.display_name,o.unit

    union all

    select * from (
      select
        'steps'::text observation_type,
        coalesce(ds.provider,o.provenance->>'provider','manual') provider,
        coalesce(ds.display_name,o.provenance->>'source','User-reported daily total') display_name,
        coalesce(o.unit,'count') unit,
        o.value_number total_value,
        1::bigint samples,
        o.observed_at first_at,
        o.observed_at last_at,
        coalesce(o.quality,'accepted') quality,
        'authoritative_daily_total'::text aggregation
      from public.observations o
      left join public.data_sources ds on ds.id=o.data_source_id
      where o.user_id=p_user_id
        and o.domain='health'
        and o.observation_type='steps-daily-total'
        and o.observed_at>=v_day_start
        and o.observed_at<least(v_day_end,p_as_of+interval '1 second')
        and o.value_number is not null
        and coalesce(o.quality,'accepted') not in
          ('suspect','rejected','rejected_for_decision_use','corrected/superseded')
      order by o.observed_at desc
      limit 1
    ) manual_steps

    union all

    select
      'steps'::text observation_type,
      ds.provider,
      ds.display_name,
      s.unit,
      sum(s.value_number) total_value,
      count(*) samples,
      min(s.observed_at) first_at,
      max(s.observed_at) last_at,
      'accepted'::text quality,
      'source_attributed_watch_sum'::text aggregation
    from public.observations s
    join public.observations src
      on src.user_id=s.user_id
     and src.domain='health'
     and src.observation_type='healthsync.steps.source'
     and src.observed_at=s.observed_at
     and coalesce(src.provenance->>'sourceFileId','')=coalesce(s.provenance->>'sourceFileId','')
     and src.value_text='com.huami.watch.hmwatchmanager'
     and coalesce(src.quality,'accepted') not in
       ('suspect','rejected','rejected_for_decision_use','corrected/superseded')
    left join public.data_sources ds on ds.id=s.data_source_id
    where s.user_id=p_user_id
      and s.domain='health'
      and s.observation_type='steps'
      and s.observed_at>=v_day_start
      and s.observed_at<least(v_day_end,p_as_of+interval '1 second')
      and s.value_number is not null
      and coalesce(s.quality,'accepted') not in
        ('suspect','rejected','rejected_for_decision_use','corrected/superseded')
      and not exists (
        select 1
        from public.observations m
        where m.user_id=p_user_id
          and m.domain='health'
          and m.observation_type='steps-daily-total'
          and m.observed_at>=v_day_start
          and m.observed_at<least(v_day_end,p_as_of+interval '1 second')
          and m.value_number is not null
          and coalesce(m.quality,'accepted') not in
            ('suspect','rejected','rejected_for_decision_use','corrected/superseded')
      )
    group by ds.provider,ds.display_name,s.unit
  ) x;

  select jsonb_build_object(
    'accepted',count(*) filter(where coalesce(quality,'accepted') in ('accepted','source')),
    'accepted_with_warning',count(*) filter(where quality='accepted_with_warning'),
    'suspect',count(*) filter(where quality='suspect'),
    'rejected',count(*) filter(where quality in ('rejected','rejected_for_decision_use')),
    'latest_observation_at',max(observed_at)
  )
  into v_quality
  from public.observations
  where user_id=p_user_id
    and domain='health'
    and observed_at>=p_as_of-interval '24 hours'
    and observed_at<=p_as_of;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',provider,
    'display_name',display_name,
    'last_sync_at',last_sync_at,
    'status',status
  ) order by provider,display_name),'[]'::jsonb)
  into v_sources
  from public.data_sources
  where user_id=p_user_id
    and kind in ('health_sensor','health_file_export');

  select coalesce(jsonb_agg(jsonb_build_object('day',s.local_day,'timezone',s.timezone,'metric',s.metric,
    'unit',s.unit,'provider','health-connect','source',ds.display_name,'source_package',s.source_package,'device',s.device,
    'samples',s.sample_count,'usable_samples',s.usable_count,'rejected_samples',s.rejected_count,
    'minimum',s.minimum,'maximum',s.maximum,'mean',s.mean,'first_at',s.first_at,'last_at',s.last_at,
    'aggregation','descriptive_sample_statistics','method_version',s.method_version) order by s.local_day,s.metric),'[]'::jsonb)
  into v_compacted from public.health_daily_summaries s join public.data_sources ds on ds.id=s.data_source_id
  where s.user_id=p_user_id and s.last_at<=p_as_of and s.last_at>=p_as_of-interval '14 days';
  for v_summary in select distinct on(s.metric) s.*,ds.display_name from public.health_daily_summaries s
    join public.data_sources ds on ds.id=s.data_source_id and ds.user_id=s.user_id
    where s.user_id=p_user_id and s.last_usable_at<=p_as_of and s.last_usable_at>=p_as_of-interval '14 days'
    order by s.metric,s.last_usable_at desc,s.id
  loop
    if not(v_latest?v_summary.metric) or (v_latest->v_summary.metric->>'observed_at')::timestamptz<v_summary.last_usable_at then
      v_latest:=v_latest||jsonb_build_object(v_summary.metric,jsonb_build_object('observed_at',v_summary.last_usable_at,
        'value_number',v_summary.last_value,'unit',v_summary.unit,'quality',v_summary.last_quality,
        'confidence',case when v_summary.last_confidence is null then null else least(v_summary.last_confidence,0.6) end,
        'provider','health-connect','source',v_summary.display_name,'compacted',true,'method_version',v_summary.method_version));
    end if;
  end loop;

  return jsonb_build_object(
    'as_of',p_as_of,
    'timezone',v_timezone,
    'latest',v_latest,
    'compacted_daily',v_compacted,
    'body_state',v_body_state,
    'body_state_policy',jsonb_build_object(
      'weight_primary_source','HealthSync/Health Connect',
      'weight_manual_fallback','only when no usable HealthSync/Health Connect weight exists in the bounded window',
      'composition_source','ChatGPT-derived/manual evidence',
      'composition_is_measured',false,
      'composition_decision_use','low-confidence context only; never equivalent to measured composition'
    ),
    'today_totals_by_source',v_daily,
    'quality_24h',coalesce(v_quality,'{}'::jsonb),
    'sources',v_sources
  );
end
$function$
;

-- An existing approved single-owner policy enables this private database job.
-- cron uses UTC03:15; each owner's complete-day cutoff uses profile timezone.
do $schedule$ begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    perform cron.schedule('meplus-health-seven-day-compaction','15 3 * * *','select private.compact_health_seven_days();');
  end if;
end $schedule$;
