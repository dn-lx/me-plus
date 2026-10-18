-- Preserve foreign-key children committed while the candidate SELECT is in flight.
-- Fail closed at stronger isolation levels whose snapshot cannot refresh.
create or replace function private.compact_health_seven_days(p_limit integer default 5000)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare source record; group_row record; candidate jsonb; receipt_id uuid; total integer:=0; cutoff timestamptz;
  observation_count integer;raw_count integer;revision_count integer;summary_ids jsonb;
  failures integer:=0;error_state text;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'unsupported_compaction_isolation';end if;
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
    -- Separate statement: refresh the READ COMMITTED snapshot after locking.
    -- A child committed between the original snapshot and parent row locks must
    -- be retained; held FOR UPDATE locks prevent subsequent FK insertions.
    select coalesce(jsonb_agg(x),'[]'::jsonb) into candidate
      from jsonb_array_elements(candidate)x
      where not private.health_raw_has_other_references((x->>'raw_id')::uuid)
        and not private.health_observation_has_references((x->>'observation_id')::uuid)
        and not exists(select 1 from public.fact_corrections fc
          where fc.user_id=source.user_id and fc.entity_type='observation'
            and fc.entity_id=(x->>'observation_id')::uuid);
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
