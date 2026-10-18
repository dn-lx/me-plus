create index if not exists fact_corrections_data_source_idx
  on public.fact_corrections(data_source_id)
  where data_source_id is not null;

create index if not exists fact_corrections_raw_event_idx
  on public.fact_corrections(raw_event_id)
  where raw_event_id is not null;

create or replace function public.server_correct_financial_account(
  p_user_id uuid,
  p_account_id uuid,
  p_changes jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.financial_accounts%rowtype;
  v_after public.financial_accounts%rowtype;
  v_fields text[];
  v_before jsonb;
  v_after_values jsonb;
  v_correction_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'correction reason is required'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'changes must be a JSON object'; end if;
  select array_agg(key order by key) into v_fields from jsonb_object_keys(p_changes) key;
  if coalesce(cardinality(v_fields),0)=0 then raise exception 'at least one change is required'; end if;
  if exists (select 1 from unnest(v_fields) f where not (f = any(array['display_name','account_type','currency']::text[]))) then raise exception 'unsupported financial account correction field'; end if;

  select * into v_row from public.financial_accounts where id=p_account_id and user_id=p_user_id for update;
  if not found then raise exception 'financial account not found'; end if;
  if p_changes ? 'display_name' and nullif(btrim(p_changes->>'display_name'),'') is null then raise exception 'display_name cannot be blank'; end if;
  if p_changes ? 'account_type' and nullif(btrim(p_changes->>'account_type'),'') is null then raise exception 'account_type cannot be blank'; end if;
  if p_changes ? 'currency' and nullif(btrim(p_changes->>'currency'),'') is null then raise exception 'currency cannot be blank'; end if;

  v_before := jsonb_build_object('display_name',v_row.display_name,'account_type',v_row.account_type,'currency',v_row.currency);

  update public.financial_accounts
  set display_name = case when p_changes ? 'display_name' then btrim(p_changes->>'display_name') else display_name end,
      account_type = case when p_changes ? 'account_type' then btrim(p_changes->>'account_type') else account_type end,
      currency = case when p_changes ? 'currency' then upper(btrim(p_changes->>'currency')) else currency end,
      metadata = private.merge_user_correction_markers(metadata,v_fields,v_now),
      updated_at = v_now
  where id=p_account_id and user_id=p_user_id
  returning * into v_after;

  v_after_values := jsonb_build_object('display_name',v_after.display_name,'account_type',v_after.account_type,'currency',v_after.currency);
  v_correction_id := private.record_fact_correction(
    p_user_id,'financial_account',p_account_id,
    case when v_row.data_source_id is null then 'manual' else 'integration' end,
    v_row.data_source_id,null,p_reason,v_fields,v_before,v_after_values
  );
  return jsonb_build_object('correction_id',v_correction_id,'entity_id',p_account_id,'changed_fields',v_fields);
end;
$function$;

create or replace function public.server_correct_financial_transaction(
  p_user_id uuid,
  p_transaction_id uuid,
  p_changes jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.financial_transactions%rowtype;
  v_after public.financial_transactions%rowtype;
  v_fields text[];
  v_before jsonb;
  v_after_values jsonb;
  v_correction_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'correction reason is required'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'changes must be a JSON object'; end if;
  select array_agg(key order by key) into v_fields from jsonb_object_keys(p_changes) key;
  if coalesce(cardinality(v_fields),0)=0 then raise exception 'at least one change is required'; end if;
  if exists (select 1 from unnest(v_fields) f where not (f = any(array['merchant','description','category','transaction_type','recurring_candidate']::text[]))) then raise exception 'unsupported financial transaction correction field'; end if;
  if p_changes ? 'recurring_candidate' and jsonb_typeof(p_changes->'recurring_candidate') is distinct from 'boolean' then raise exception 'recurring_candidate must be boolean'; end if;

  select * into v_row from public.financial_transactions where id=p_transaction_id and user_id=p_user_id for update;
  if not found then raise exception 'financial transaction not found'; end if;

  v_before := jsonb_build_object('merchant',v_row.merchant,'description',v_row.description,'category',v_row.category,'transaction_type',v_row.transaction_type,'recurring_candidate',v_row.recurring_candidate);
  update public.financial_transactions
  set merchant = case when p_changes ? 'merchant' then p_changes->>'merchant' else merchant end,
      description = case when p_changes ? 'description' then p_changes->>'description' else description end,
      category = case when p_changes ? 'category' then p_changes->>'category' else category end,
      transaction_type = case when p_changes ? 'transaction_type' then p_changes->>'transaction_type' else transaction_type end,
      recurring_candidate = case when p_changes ? 'recurring_candidate' then (p_changes->>'recurring_candidate')::boolean else recurring_candidate end,
      metadata = private.merge_user_correction_markers(metadata,v_fields,v_now),
      updated_at = v_now
  where id=p_transaction_id and user_id=p_user_id
  returning * into v_after;

  v_after_values := jsonb_build_object('merchant',v_after.merchant,'description',v_after.description,'category',v_after.category,'transaction_type',v_after.transaction_type,'recurring_candidate',v_after.recurring_candidate);
  v_correction_id := private.record_fact_correction(
    p_user_id,'financial_transaction',p_transaction_id,
    case when v_row.data_source_id is null then 'manual' else 'integration' end,
    v_row.data_source_id,null,p_reason,v_fields,v_before,v_after_values
  );
  return jsonb_build_object('correction_id',v_correction_id,'entity_id',p_transaction_id,'changed_fields',v_fields);
end;
$function$;

create or replace function public.server_correct_observation(
  p_user_id uuid,
  p_observation_id uuid,
  p_changes jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.observations%rowtype;
  v_after public.observations%rowtype;
  v_fields text[];
  v_before jsonb;
  v_after_values jsonb;
  v_correction_id uuid;
  v_now timestamptz := clock_timestamp();
  v_value_field_count integer;
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'correction reason is required'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'changes must be a JSON object'; end if;
  select array_agg(key order by key) into v_fields from jsonb_object_keys(p_changes) key;
  if coalesce(cardinality(v_fields),0)=0 then raise exception 'at least one change is required'; end if;
  if exists (select 1 from unnest(v_fields) f where not (f = any(array['value_number','value_text','value_boolean','value_json','unit','quality','confidence']::text[]))) then raise exception 'unsupported observation correction field'; end if;
  select count(*) into v_value_field_count from unnest(v_fields) f where f = any(array['value_number','value_text','value_boolean','value_json']::text[]);
  if v_value_field_count > 1 then raise exception 'correct one observation value field at a time'; end if;
  if p_changes ? 'value_boolean' and jsonb_typeof(p_changes->'value_boolean') not in ('boolean','null') then raise exception 'value_boolean must be boolean or null'; end if;
  if p_changes ? 'confidence' and jsonb_typeof(p_changes->'confidence') not in ('number','null') then raise exception 'confidence must be numeric or null'; end if;
  if p_changes ? 'value_number' and jsonb_typeof(p_changes->'value_number') not in ('number','null') then raise exception 'value_number must be numeric or null'; end if;

  select * into v_row from public.observations where id=p_observation_id and user_id=p_user_id for update;
  if not found then raise exception 'observation not found'; end if;
  v_before := jsonb_build_object('value_number',v_row.value_number,'value_text',v_row.value_text,'value_boolean',v_row.value_boolean,'value_json',v_row.value_json,'unit',v_row.unit,'quality',v_row.quality,'confidence',v_row.confidence);

  update public.observations
  set value_number = case when p_changes ?| array['value_number','value_text','value_boolean','value_json'] then case when p_changes ? 'value_number' then nullif(p_changes->>'value_number','')::double precision else null end else value_number end,
      value_text = case when p_changes ?| array['value_number','value_text','value_boolean','value_json'] then case when p_changes ? 'value_text' then p_changes->>'value_text' else null end else value_text end,
      value_boolean = case when p_changes ?| array['value_number','value_text','value_boolean','value_json'] then case when p_changes ? 'value_boolean' then nullif(p_changes->>'value_boolean','')::boolean else null end else value_boolean end,
      value_json = case when p_changes ?| array['value_number','value_text','value_boolean','value_json'] then case when p_changes ? 'value_json' then case when p_changes->'value_json'='null'::jsonb then null else p_changes->'value_json' end else null end else value_json end,
      unit = case when p_changes ? 'unit' then p_changes->>'unit' else unit end,
      quality = case when p_changes ? 'quality' then p_changes->>'quality' else quality end,
      confidence = case when p_changes ? 'confidence' then nullif(p_changes->>'confidence','')::numeric else confidence end,
      provenance = private.merge_user_correction_markers(provenance,v_fields,v_now),
      updated_at = v_now
  where id=p_observation_id and user_id=p_user_id
  returning * into v_after;

  v_after_values := jsonb_build_object('value_number',v_after.value_number,'value_text',v_after.value_text,'value_boolean',v_after.value_boolean,'value_json',v_after.value_json,'unit',v_after.unit,'quality',v_after.quality,'confidence',v_after.confidence);
  v_correction_id := private.record_fact_correction(
    p_user_id,'observation',p_observation_id,
    case when v_row.data_source_id is null and v_row.raw_event_id is null then 'manual' else 'integration' end,
    v_row.data_source_id,v_row.raw_event_id,p_reason,v_fields,v_before,v_after_values
  );
  return jsonb_build_object('correction_id',v_correction_id,'entity_id',p_observation_id,'changed_fields',v_fields);
end;
$function$;

create or replace function public.server_correct_document(
  p_user_id uuid,
  p_document_id uuid,
  p_changes jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.documents%rowtype;
  v_after public.documents%rowtype;
  v_fields text[];
  v_before jsonb;
  v_after_values jsonb;
  v_correction_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'correction reason is required'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'changes must be a JSON object'; end if;
  select array_agg(key order by key) into v_fields from jsonb_object_keys(p_changes) key;
  if coalesce(cardinality(v_fields),0)=0 then raise exception 'at least one change is required'; end if;
  if exists (select 1 from unnest(v_fields) f where not (f = any(array['document_type','title','document_date']::text[]))) then raise exception 'unsupported document correction field'; end if;
  if p_changes ? 'document_type' and nullif(btrim(p_changes->>'document_type'),'') is null then raise exception 'document_type cannot be blank'; end if;
  if p_changes ? 'title' and nullif(btrim(p_changes->>'title'),'') is null then raise exception 'title cannot be blank'; end if;

  select * into v_row from public.documents where id=p_document_id and user_id=p_user_id for update;
  if not found then raise exception 'document not found'; end if;
  v_before := jsonb_build_object('document_type',v_row.document_type,'title',v_row.title,'document_date',v_row.document_date);

  update public.documents
  set document_type = case when p_changes ? 'document_type' then btrim(p_changes->>'document_type') else document_type end,
      title = case when p_changes ? 'title' then btrim(p_changes->>'title') else title end,
      document_date = case when p_changes ? 'document_date' then nullif(p_changes->>'document_date','')::date else document_date end,
      metadata = private.merge_user_correction_markers(metadata,v_fields,v_now),
      updated_at = v_now
  where id=p_document_id and user_id=p_user_id
  returning * into v_after;

  v_after_values := jsonb_build_object('document_type',v_after.document_type,'title',v_after.title,'document_date',v_after.document_date);
  v_correction_id := private.record_fact_correction(
    p_user_id,'document',p_document_id,
    case when v_row.data_source_id is null then 'manual' else 'integration' end,
    v_row.data_source_id,null,p_reason,v_fields,v_before,v_after_values
  );
  return jsonb_build_object('correction_id',v_correction_id,'entity_id',p_document_id,'changed_fields',v_fields);
end;
$function$;

revoke all on function public.server_correct_financial_account(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.server_correct_financial_transaction(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.server_correct_observation(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.server_correct_document(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.server_correct_financial_account(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.server_correct_financial_transaction(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.server_correct_observation(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.server_correct_document(uuid,uuid,jsonb,text) to service_role;

drop function public.correct_financial_account(uuid,jsonb,text);
drop function public.correct_financial_transaction(uuid,jsonb,text);
drop function public.correct_observation(uuid,jsonb,text);
drop function public.correct_document(uuid,jsonb,text);