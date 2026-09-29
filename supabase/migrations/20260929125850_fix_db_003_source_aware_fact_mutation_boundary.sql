create table public.fact_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('financial_account','financial_transaction','observation','document')),
  entity_id uuid not null,
  source_kind text not null check (source_kind in ('manual','integration','derived')),
  data_source_id uuid references public.data_sources(id) on delete set null,
  raw_event_id uuid references public.raw_events(id) on delete set null,
  correction_reason text not null check (length(btrim(correction_reason)) between 1 and 1000),
  changed_fields text[] not null check (cardinality(changed_fields) > 0),
  before_values jsonb not null,
  after_values jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.fact_corrections is
  'Append-only history for explicit user corrections to normalized facts. Current values remain in their typed domain tables while original provenance is preserved.';

create index fact_corrections_user_entity_idx
  on public.fact_corrections(user_id,entity_type,entity_id,created_at desc);

alter table public.fact_corrections enable row level security;
revoke all on table public.fact_corrections from public, anon, authenticated;
grant select on table public.fact_corrections to authenticated;
grant select,insert,update,delete on table public.fact_corrections to service_role;

create policy fact_corrections_select
on public.fact_corrections
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function private.merge_user_correction_markers(
  p_metadata jsonb,
  p_fields text[],
  p_at timestamptz
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_existing jsonb;
  v_fields jsonb;
begin
  v_existing := case
    when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)->'userCorrectedFields')='array'
      then coalesce(p_metadata,'{}'::jsonb)->'userCorrectedFields'
    else '[]'::jsonb
  end;

  select coalesce(jsonb_agg(to_jsonb(field) order by field),'[]'::jsonb)
  into v_fields
  from (
    select distinct field
    from (
      select value as field from jsonb_array_elements_text(v_existing)
      union all
      select unnest(p_fields) as field
    ) x
    where field is not null and btrim(field) <> ''
  ) d;

  return jsonb_set(
    jsonb_set(coalesce(p_metadata,'{}'::jsonb),'{userCorrectedFields}',v_fields,true),
    '{lastUserCorrectionAt}',
    to_jsonb(p_at),
    true
  );
end;
$function$;

revoke all on function private.merge_user_correction_markers(jsonb,text[],timestamptz)
from public,anon,authenticated;

create or replace function private.record_fact_correction(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_source_kind text,
  p_data_source_id uuid,
  p_raw_event_id uuid,
  p_reason text,
  p_fields text[],
  p_before jsonb,
  p_after jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  insert into public.fact_corrections(
    user_id,entity_type,entity_id,source_kind,data_source_id,raw_event_id,
    correction_reason,changed_fields,before_values,after_values
  ) values (
    p_user_id,p_entity_type,p_entity_id,p_source_kind,p_data_source_id,p_raw_event_id,
    btrim(p_reason),p_fields,p_before,p_after
  )
  returning id into v_id;

  insert into public.audit_events(
    user_id,actor_type,actor_id,event_type,entity_type,entity_id,occurred_at,metadata
  ) values (
    p_user_id,'user',p_user_id::text,'fact_corrected',p_entity_type,p_entity_id,clock_timestamp(),
    jsonb_build_object(
      'correction_id',v_id,
      'changed_fields',to_jsonb(p_fields),
      'source_kind',p_source_kind,
      'reason',btrim(p_reason)
    )
  );

  return v_id;
end;
$function$;

revoke all on function private.record_fact_correction(uuid,text,uuid,text,uuid,uuid,text,text[],jsonb,jsonb)
from public,anon,authenticated;

create or replace function public.correct_financial_account(
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
  v_user uuid := auth.uid();
  v_row public.financial_accounts%rowtype;
  v_after public.financial_accounts%rowtype;
  v_fields text[];
  v_before jsonb;
  v_after_values jsonb;
  v_correction_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'correction reason is required'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'changes must be a JSON object'; end if;

  select array_agg(key order by key) into v_fields from jsonb_object_keys(p_changes) key;
  if coalesce(cardinality(v_fields),0)=0 then raise exception 'at least one change is required'; end if;
  if exists (select 1 from unnest(v_fields) f where not (f = any(array['display_name','account_type','currency']::text[]))) then
    raise exception 'unsupported financial account correction field';
  end if;

  select * into v_row from public.financial_accounts where id=p_account_id and user_id=v_user for update;
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
  where id=p_account_id and user_id=v_user
  returning * into v_after;

  v_after_values := jsonb_build_object('display_name',v_after.display_name,'account_type',v_after.account_type,'currency',v_after.currency);

  v_correction_id := private.record_fact_correction(
    v_user,'financial_account',p_account_id,
    case when v_row.data_source_id is null then 'manual' else 'integration' end,
    v_row.data_source_id,null,p_reason,v_fields,v_before,v_after_values
  );

  return jsonb_build_object('correction_id',v_correction_id,'entity_id',p_account_id,'changed_fields',v_fields);
end;
$function$;

revoke all on function public.correct_financial_account(uuid,jsonb,text) from public,anon;
grant execute on function public.correct_financial_account(uuid,jsonb,text) to authenticated;

create or replace function public.correct_financial_transaction(
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
  v_user uuid := auth.uid();
  v_row public.financial_transactions%rowtype;
  v_after public.financial_transactions%rowtype;
  v_fields text[];
  v_before jsonb;
  v_after_values jsonb;
  v_correction_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'correction reason is required'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'changes must be a JSON object'; end if;

  select array_agg(key order by key) into v_fields from jsonb_object_keys(p_changes) key;
  if coalesce(cardinality(v_fields),0)=0 then raise exception 'at least one change is required'; end if;
  if exists (select 1 from unnest(v_fields) f where not (f = any(array['merchant','description','category','transaction_type','recurring_candidate']::text[]))) then
    raise exception 'unsupported financial transaction correction field';
  end if;
  if p_changes ? 'recurring_candidate' and jsonb_typeof(p_changes->'recurring_candidate') is distinct from 'boolean' then
    raise exception 'recurring_candidate must be boolean';
  end if;

  select * into v_row from public.financial_transactions where id=p_transaction_id and user_id=v_user for update;
  if not found then raise exception 'financial transaction not found'; end if;

  v_before := jsonb_build_object(
    'merchant',v_row.merchant,'description',v_row.description,'category',v_row.category,
    'transaction_type',v_row.transaction_type,'recurring_candidate',v_row.recurring_candidate
  );

  update public.financial_transactions
  set merchant = case when p_changes ? 'merchant' then p_changes->>'merchant' else merchant end,
      description = case when p_changes ? 'description' then p_changes->>'description' else description end,
      category = case when p_changes ? 'category' then p_changes->>'category' else category end,
      transaction_type = case when p_changes ? 'transaction_type' then p_changes->>'transaction_type' else transaction_type end,
      recurring_candidate = case when p_changes ? 'recurring_candidate' then (p_changes->>'recurring_candidate')::boolean else recurring_candidate end,
      metadata = private.merge_user_correction_markers(metadata,v_fields,v_now),
      updated_at = v_now
  where id=p_transaction_id and user_id=v_user
  returning * into v_after;

  v_after_values := jsonb_build_object(
    'merchant',v_after.merchant,'description',v_after.description,'category',v_after.category,
    'transaction_type',v_after.transaction_type,'recurring_candidate',v_after.recurring_candidate
  );

  v_correction_id := private.record_fact_correction(
    v_user,'financial_transaction',p_transaction_id,
    case when v_row.data_source_id is null then 'manual' else 'integration' end,
    v_row.data_source_id,null,p_reason,v_fields,v_before,v_after_values
  );

  return jsonb_build_object('correction_id',v_correction_id,'entity_id',p_transaction_id,'changed_fields',v_fields);
end;
$function$;

revoke all on function public.correct_financial_transaction(uuid,jsonb,text) from public,anon;
grant execute on function public.correct_financial_transaction(uuid,jsonb,text) to authenticated;

create or replace function public.correct_observation(
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
  v_user uuid := auth.uid();
  v_row public.observations%rowtype;
  v_after public.observations%rowtype;
  v_fields text[];
  v_before jsonb;
  v_after_values jsonb;
  v_correction_id uuid;
  v_now timestamptz := clock_timestamp();
  v_value_field_count integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'correction reason is required'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'changes must be a JSON object'; end if;

  select array_agg(key order by key) into v_fields from jsonb_object_keys(p_changes) key;
  if coalesce(cardinality(v_fields),0)=0 then raise exception 'at least one change is required'; end if;
  if exists (select 1 from unnest(v_fields) f where not (f = any(array[
    'value_number','value_text','value_boolean','value_json','unit','quality','confidence'
  ]::text[]))) then
    raise exception 'unsupported observation correction field';
  end if;

  select count(*) into v_value_field_count from unnest(v_fields) f
  where f = any(array['value_number','value_text','value_boolean','value_json']::text[]);
  if v_value_field_count > 1 then raise exception 'correct one observation value field at a time'; end if;

  if p_changes ? 'value_boolean' and jsonb_typeof(p_changes->'value_boolean') not in ('boolean','null') then raise exception 'value_boolean must be boolean or null'; end if;
  if p_changes ? 'confidence' and jsonb_typeof(p_changes->'confidence') not in ('number','null') then raise exception 'confidence must be numeric or null'; end if;
  if p_changes ? 'value_number' and jsonb_typeof(p_changes->'value_number') not in ('number','null') then raise exception 'value_number must be numeric or null'; end if;

  select * into v_row from public.observations where id=p_observation_id and user_id=v_user for update;
  if not found then raise exception 'observation not found'; end if;

  v_before := jsonb_build_object(
    'value_number',v_row.value_number,'value_text',v_row.value_text,'value_boolean',v_row.value_boolean,
    'value_json',v_row.value_json,'unit',v_row.unit,'quality',v_row.quality,'confidence',v_row.confidence
  );

  update public.observations
  set value_number = case
        when p_changes ?| array['value_number','value_text','value_boolean','value_json']
          then case when p_changes ? 'value_number' then nullif(p_changes->>'value_number','')::double precision else null end
        else value_number end,
      value_text = case
        when p_changes ?| array['value_number','value_text','value_boolean','value_json']
          then case when p_changes ? 'value_text' then p_changes->>'value_text' else null end
        else value_text end,
      value_boolean = case
        when p_changes ?| array['value_number','value_text','value_boolean','value_json']
          then case when p_changes ? 'value_boolean' then nullif(p_changes->>'value_boolean','')::boolean else null end
        else value_boolean end,
      value_json = case
        when p_changes ?| array['value_number','value_text','value_boolean','value_json']
          then case when p_changes ? 'value_json' then case when p_changes->'value_json'='null'::jsonb then null else p_changes->'value_json' end else null end
        else value_json end,
      unit = case when p_changes ? 'unit' then p_changes->>'unit' else unit end,
      quality = case when p_changes ? 'quality' then p_changes->>'quality' else quality end,
      confidence = case when p_changes ? 'confidence' then nullif(p_changes->>'confidence','')::numeric else confidence end,
      provenance = private.merge_user_correction_markers(provenance,v_fields,v_now),
      updated_at = v_now
  where id=p_observation_id and user_id=v_user
  returning * into v_after;

  v_after_values := jsonb_build_object(
    'value_number',v_after.value_number,'value_text',v_after.value_text,'value_boolean',v_after.value_boolean,
    'value_json',v_after.value_json,'unit',v_after.unit,'quality',v_after.quality,'confidence',v_after.confidence
  );

  v_correction_id := private.record_fact_correction(
    v_user,'observation',p_observation_id,
    case when v_row.data_source_id is null and v_row.raw_event_id is null then 'manual' else 'integration' end,
    v_row.data_source_id,v_row.raw_event_id,p_reason,v_fields,v_before,v_after_values
  );

  return jsonb_build_object('correction_id',v_correction_id,'entity_id',p_observation_id,'changed_fields',v_fields);
end;
$function$;

revoke all on function public.correct_observation(uuid,jsonb,text) from public,anon;
grant execute on function public.correct_observation(uuid,jsonb,text) to authenticated;

create or replace function public.correct_document(
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
  v_user uuid := auth.uid();
  v_row public.documents%rowtype;
  v_after public.documents%rowtype;
  v_fields text[];
  v_before jsonb;
  v_after_values jsonb;
  v_correction_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'correction reason is required'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'changes must be a JSON object'; end if;

  select array_agg(key order by key) into v_fields from jsonb_object_keys(p_changes) key;
  if coalesce(cardinality(v_fields),0)=0 then raise exception 'at least one change is required'; end if;
  if exists (select 1 from unnest(v_fields) f where not (f = any(array['document_type','title','document_date']::text[]))) then
    raise exception 'unsupported document correction field';
  end if;

  if p_changes ? 'document_type' and nullif(btrim(p_changes->>'document_type'),'') is null then raise exception 'document_type cannot be blank'; end if;
  if p_changes ? 'title' and nullif(btrim(p_changes->>'title'),'') is null then raise exception 'title cannot be blank'; end if;

  select * into v_row from public.documents where id=p_document_id and user_id=v_user for update;
  if not found then raise exception 'document not found'; end if;

  v_before := jsonb_build_object('document_type',v_row.document_type,'title',v_row.title,'document_date',v_row.document_date);

  update public.documents
  set document_type = case when p_changes ? 'document_type' then btrim(p_changes->>'document_type') else document_type end,
      title = case when p_changes ? 'title' then btrim(p_changes->>'title') else title end,
      document_date = case when p_changes ? 'document_date' then nullif(p_changes->>'document_date','')::date else document_date end,
      metadata = private.merge_user_correction_markers(metadata,v_fields,v_now),
      updated_at = v_now
  where id=p_document_id and user_id=v_user
  returning * into v_after;

  v_after_values := jsonb_build_object('document_type',v_after.document_type,'title',v_after.title,'document_date',v_after.document_date);

  v_correction_id := private.record_fact_correction(
    v_user,'document',p_document_id,
    case when v_row.data_source_id is null then 'manual' else 'integration' end,
    v_row.data_source_id,null,p_reason,v_fields,v_before,v_after_values
  );

  return jsonb_build_object('correction_id',v_correction_id,'entity_id',p_document_id,'changed_fields',v_fields);
end;
$function$;

revoke all on function public.correct_document(uuid,jsonb,text) from public,anon;
grant execute on function public.correct_document(uuid,jsonb,text) to authenticated;

drop policy if exists data_sources_all on public.data_sources;
revoke all on table public.data_sources from anon,authenticated;
grant select on table public.data_sources to authenticated;
grant insert (user_id,kind,provider,display_name,status,metadata) on public.data_sources to authenticated;
grant update (display_name,status,metadata) on public.data_sources to authenticated;
grant delete on table public.data_sources to authenticated;

create policy data_sources_select on public.data_sources for select to authenticated using ((select auth.uid())=user_id);
create policy data_sources_insert_manual on public.data_sources for insert to authenticated with check (
  (select auth.uid())=user_id and kind='manual' and provider='meplus_manual'
  and external_account_ref is null and last_sync_at is null
);
create policy data_sources_update_manual on public.data_sources for update to authenticated using (
  (select auth.uid())=user_id and kind='manual' and provider='meplus_manual' and external_account_ref is null
) with check (
  (select auth.uid())=user_id and kind='manual' and provider='meplus_manual'
  and external_account_ref is null and last_sync_at is null
);
create policy data_sources_delete_manual on public.data_sources for delete to authenticated using (
  (select auth.uid())=user_id and kind='manual' and provider='meplus_manual' and external_account_ref is null
);

drop policy if exists financial_accounts_all on public.financial_accounts;
revoke all on table public.financial_accounts from anon,authenticated;
grant select on table public.financial_accounts to authenticated;
grant insert (user_id,account_type,display_name,currency,current_balance,available_balance,balance_as_of,active,metadata) on public.financial_accounts to authenticated;
grant update (account_type,display_name,currency,current_balance,available_balance,balance_as_of,active,metadata) on public.financial_accounts to authenticated;
grant delete on table public.financial_accounts to authenticated;

create policy financial_accounts_select on public.financial_accounts for select to authenticated using ((select auth.uid())=user_id);
create policy financial_accounts_insert_manual on public.financial_accounts for insert to authenticated with check (
  (select auth.uid())=user_id and data_source_id is null and provider is null and external_account_ref is null and provider_account_identity_hash is null
);
create policy financial_accounts_update_manual on public.financial_accounts for update to authenticated using (
  (select auth.uid())=user_id and data_source_id is null and provider is null and external_account_ref is null and provider_account_identity_hash is null
) with check (
  (select auth.uid())=user_id and data_source_id is null and provider is null and external_account_ref is null and provider_account_identity_hash is null
);
create policy financial_accounts_delete_manual on public.financial_accounts for delete to authenticated using (
  (select auth.uid())=user_id and data_source_id is null and provider is null and external_account_ref is null and provider_account_identity_hash is null
);

drop policy if exists financial_transactions_all on public.financial_transactions;
revoke all on table public.financial_transactions from anon,authenticated;
grant select on table public.financial_transactions to authenticated;
grant insert (user_id,financial_account_id,booked_at,value_at,amount,currency,merchant,description,category,transaction_type,recurring_candidate,metadata) on public.financial_transactions to authenticated;
grant update (financial_account_id,booked_at,value_at,amount,currency,merchant,description,category,transaction_type,recurring_candidate,metadata) on public.financial_transactions to authenticated;
grant delete on table public.financial_transactions to authenticated;

create policy financial_transactions_select on public.financial_transactions for select to authenticated using ((select auth.uid())=user_id);
create policy financial_transactions_insert_manual on public.financial_transactions for insert to authenticated with check (
  (select auth.uid())=user_id and data_source_id is null and external_transaction_id is null
  and exists (
    select 1 from public.financial_accounts a
    where a.id=financial_account_id and a.user_id=user_id and a.data_source_id is null and a.provider is null
  )
);
create policy financial_transactions_update_manual on public.financial_transactions for update to authenticated using (
  (select auth.uid())=user_id and data_source_id is null and external_transaction_id is null
  and exists (
    select 1 from public.financial_accounts a
    where a.id=financial_account_id and a.user_id=user_id and a.data_source_id is null and a.provider is null
  )
) with check (
  (select auth.uid())=user_id and data_source_id is null and external_transaction_id is null
  and exists (
    select 1 from public.financial_accounts a
    where a.id=financial_account_id and a.user_id=user_id and a.data_source_id is null and a.provider is null
  )
);
create policy financial_transactions_delete_manual on public.financial_transactions for delete to authenticated using (
  (select auth.uid())=user_id and data_source_id is null and external_transaction_id is null
);

drop policy if exists observations_all on public.observations;
revoke all on table public.observations from anon,authenticated;
grant select on table public.observations to authenticated;
grant insert (user_id,domain,observation_type,observed_at,value_number,value_text,value_boolean,value_json,unit,quality,confidence,provenance) on public.observations to authenticated;
grant update (domain,observation_type,observed_at,value_number,value_text,value_boolean,value_json,unit,quality,confidence,provenance) on public.observations to authenticated;
grant delete on table public.observations to authenticated;

create policy observations_select on public.observations for select to authenticated using ((select auth.uid())=user_id);
create policy observations_insert_manual on public.observations for insert to authenticated with check (
  (select auth.uid())=user_id and data_source_id is null and raw_event_id is null
);
create policy observations_update_manual on public.observations for update to authenticated using (
  (select auth.uid())=user_id and data_source_id is null and raw_event_id is null
) with check (
  (select auth.uid())=user_id and data_source_id is null and raw_event_id is null
);
create policy observations_delete_manual on public.observations for delete to authenticated using (
  (select auth.uid())=user_id and data_source_id is null and raw_event_id is null
);

drop policy if exists documents_all on public.documents;
revoke all on table public.documents from anon,authenticated;
grant select on table public.documents to authenticated;
grant insert (user_id,document_type,title,mime_type,document_date,metadata) on public.documents to authenticated;
grant update (document_type,title,mime_type,document_date,metadata) on public.documents to authenticated;
grant delete on table public.documents to authenticated;

create policy documents_select on public.documents for select to authenticated using ((select auth.uid())=user_id);
create policy documents_insert_manual on public.documents for insert to authenticated with check (
  (select auth.uid())=user_id and data_source_id is null and provider is null and external_ref is null and storage_ref is null and content_hash is null
);
create policy documents_update_manual on public.documents for update to authenticated using (
  (select auth.uid())=user_id and data_source_id is null and provider is null and external_ref is null
) with check (
  (select auth.uid())=user_id and data_source_id is null and provider is null and external_ref is null
);
create policy documents_delete_manual on public.documents for delete to authenticated using (
  (select auth.uid())=user_id and data_source_id is null and provider is null and external_ref is null
);

drop policy if exists financial_snapshots_all on public.financial_snapshots;
revoke all on table public.financial_snapshots from anon,authenticated;
grant select on table public.financial_snapshots to authenticated;
create policy financial_snapshots_select on public.financial_snapshots for select to authenticated using ((select auth.uid())=user_id);