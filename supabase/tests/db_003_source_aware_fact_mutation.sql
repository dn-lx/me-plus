begin;

insert into public.documents(
  user_id,data_source_id,document_type,title,provider,external_ref,mime_type,document_date,metadata
)
select
  p.id,ds.id,'statement','DB-003 regression imported document',
  ds.provider,'db003-imported-document','application/pdf',current_date,'{}'::jsonb
from public.profiles p
join public.data_sources ds on ds.user_id=p.id and ds.kind <> 'manual'
order by p.created_at,ds.created_at
limit 1;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles order by created_at limit 1),
  true
);
set local role authenticated;

do $client$
declare
  v_user uuid := auth.uid();
  v_rows integer;
  v_before text;
  v_after text;
  v_tx uuid;
  v_account uuid;
  v_observation uuid;
  v_source uuid;
  v_document uuid;
  v_manual_source uuid;
  v_manual_account uuid;
  v_manual_transaction uuid;
  v_manual_observation uuid;
  v_manual_document uuid;
  v_expected boolean;
begin
  if v_user is null then raise exception 'authenticated test user missing'; end if;

  select id,category into v_tx,v_before
  from public.financial_transactions
  where user_id=v_user and data_source_id is not null
  order by created_at limit 1;
  if v_tx is null then raise exception 'source-backed financial transaction fixture missing'; end if;

  update public.financial_transactions
  set category='db003-illegal-direct-update'
  where id=v_tx;
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'source-backed financial transaction direct update was allowed'; end if;
  select category into v_after from public.financial_transactions where id=v_tx;
  if v_after is distinct from v_before then raise exception 'source-backed transaction changed despite RLS'; end if;

  delete from public.financial_transactions where id=v_tx;
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'source-backed financial transaction direct delete was allowed'; end if;

  v_expected := false;
  begin
    update public.financial_transactions
    set data_source_id=null
    where id=v_tx;
  exception when insufficient_privilege then
    v_expected := true;
  end;
  if not v_expected then raise exception 'protected transaction provenance column was directly writable'; end if;

  select id,display_name into v_account,v_before
  from public.financial_accounts
  where user_id=v_user and data_source_id is not null
  order by created_at limit 1;
  update public.financial_accounts
  set display_name='DB003 illegal account rename'
  where id=v_account;
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'source-backed financial account direct update was allowed'; end if;

  select id,value_number::text into v_observation,v_before
  from public.observations
  where user_id=v_user and (data_source_id is not null or raw_event_id is not null)
  order by created_at limit 1;
  update public.observations set value_number=987654 where id=v_observation;
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'source-backed observation direct update was allowed'; end if;

  select id into v_source
  from public.data_sources
  where user_id=v_user and kind <> 'manual'
  order by created_at limit 1;
  update public.data_sources set display_name='DB003 illegal source rename' where id=v_source;
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'integration data source direct update was allowed'; end if;

  select id into v_document
  from public.documents
  where user_id=v_user and external_ref='db003-imported-document';
  update public.documents set title='DB003 illegal imported doc rename' where id=v_document;
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'imported document direct update was allowed'; end if;

  v_expected := false;
  begin
    insert into public.financial_snapshots(user_id,as_of)
    values(v_user,clock_timestamp());
  exception when insufficient_privilege then
    v_expected := true;
  end;
  if not v_expected then raise exception 'derived financial snapshot direct insert was allowed'; end if;

  v_expected := false;
  begin
    insert into public.fact_corrections(
      user_id,entity_type,entity_id,source_kind,correction_reason,changed_fields,before_values,after_values
    ) values (
      v_user,'financial_transaction',v_tx,'integration','illegal direct correction',
      array['category'],'{}'::jsonb,'{}'::jsonb
    );
  exception when insufficient_privilege then
    v_expected := true;
  end;
  if not v_expected then raise exception 'fact correction history accepted direct client insert'; end if;

  if has_function_privilege(
    'authenticated',
    'public.server_correct_financial_transaction(uuid,uuid,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has server correction RPC execute privilege';
  end if;

  if has_function_privilege(
    'anon',
    'public.server_correct_financial_transaction(uuid,uuid,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly has server correction RPC execute privilege';
  end if;

  insert into public.data_sources(user_id,kind,provider,display_name,status,metadata)
  values(v_user,'manual','meplus_manual','DB-003 regression manual source','active','{}'::jsonb)
  returning id into v_manual_source;

  update public.data_sources set display_name='DB-003 regression manual source updated'
  where id=v_manual_source;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual data source update was blocked'; end if;

  insert into public.financial_accounts(
    user_id,account_type,display_name,currency,current_balance,active,metadata
  ) values (
    v_user,'cash','DB-003 regression manual account','EUR',100,true,'{}'::jsonb
  ) returning id into v_manual_account;

  update public.financial_accounts set current_balance=101 where id=v_manual_account;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual financial account update was blocked'; end if;

  insert into public.financial_transactions(
    user_id,financial_account_id,booked_at,amount,currency,description,category,recurring_candidate,metadata
  ) values (
    v_user,v_manual_account,clock_timestamp(),-5,'EUR','DB-003 manual transaction','test',false,'{}'::jsonb
  ) returning id into v_manual_transaction;

  update public.financial_transactions set category='test-updated' where id=v_manual_transaction;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual financial transaction update was blocked'; end if;

  insert into public.observations(
    user_id,domain,observation_type,observed_at,value_number,unit,quality,confidence,provenance
  ) values (
    v_user,'test','db003_manual',clock_timestamp(),1,'count','manual',1,'{}'::jsonb
  ) returning id into v_manual_observation;

  update public.observations set value_number=2 where id=v_manual_observation;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual observation update was blocked'; end if;

  insert into public.documents(user_id,document_type,title,mime_type,document_date,metadata)
  values(v_user,'note','DB-003 regression manual document','text/plain',current_date,'{}'::jsonb)
  returning id into v_manual_document;

  update public.documents set title='DB-003 regression manual document updated' where id=v_manual_document;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual document update was blocked'; end if;

  delete from public.financial_transactions where id=v_manual_transaction;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual transaction delete was blocked'; end if;

  delete from public.documents where id=v_manual_document;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual document delete was blocked'; end if;
end
$client$;

reset role;
select set_config(
  'app.db003_test_user',
  (select id::text from public.profiles order by created_at limit 1),
  true
);
set local role service_role;

do $server$
declare
  v_user uuid := current_setting('app.db003_test_user')::uuid;
  v_tx uuid;
  v_account uuid;
  v_observation uuid;
  v_document uuid;
  v_correction jsonb;
  v_expected boolean;
begin
  if not has_function_privilege(
    'service_role',
    'public.server_correct_financial_transaction(uuid,uuid,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception 'service role correction RPC execute privilege missing';
  end if;

  select id into v_tx
  from public.financial_transactions
  where user_id=v_user and data_source_id is not null
  order by created_at limit 1;

  select id into v_account
  from public.financial_accounts
  where user_id=v_user and data_source_id is not null
  order by created_at limit 1;

  select id into v_observation
  from public.observations
  where user_id=v_user and (data_source_id is not null or raw_event_id is not null)
  order by created_at limit 1;

  select id into v_document
  from public.documents
  where user_id=v_user and external_ref='db003-imported-document';

  v_correction := public.server_correct_financial_transaction(
    v_user,
    v_tx,
    jsonb_build_object('category','db003-regression-corrected','recurring_candidate',true),
    'DB-003 regression transaction correction'
  );

  if not exists (
    select 1 from public.financial_transactions
    where id=v_tx
      and category='db003-regression-corrected'
      and recurring_candidate
      and metadata->'userCorrectedFields' ? 'category'
      and metadata->'userCorrectedFields' ? 'recurring_candidate'
  ) then
    raise exception 'financial transaction server correction failed';
  end if;

  if not exists (
    select 1 from public.fact_corrections
    where id=(v_correction->>'correction_id')::uuid
      and user_id=v_user
      and entity_type='financial_transaction'
      and entity_id=v_tx
      and source_kind='integration'
  ) then
    raise exception 'financial transaction correction history missing';
  end if;

  if not exists (
    select 1 from public.audit_events
    where user_id=v_user
      and event_type='fact_corrected'
      and entity_type='financial_transaction'
      and entity_id=v_tx
      and metadata->>'correction_id'=v_correction->>'correction_id'
  ) then
    raise exception 'financial transaction correction audit missing';
  end if;

  v_expected := false;
  begin
    perform public.server_correct_financial_transaction(
      v_user,v_tx,jsonb_build_object('amount',999),
      'DB-003 illegal protected field correction'
    );
  exception when others then
    if sqlerrm='unsupported financial transaction correction field' then
      v_expected := true;
    else
      raise;
    end if;
  end;
  if not v_expected then raise exception 'protected transaction amount was correctable'; end if;

  perform public.server_correct_financial_account(
    v_user,v_account,jsonb_build_object('display_name','DB-003 corrected account label'),
    'DB-003 regression account correction'
  );
  if not exists (
    select 1 from public.financial_accounts
    where id=v_account
      and display_name='DB-003 corrected account label'
      and metadata->'userCorrectedFields' ? 'display_name'
  ) then raise exception 'financial account server correction failed'; end if;

  perform public.server_correct_observation(
    v_user,v_observation,jsonb_build_object('value_number',123.456,'quality','user_corrected'),
    'DB-003 regression observation correction'
  );
  if not exists (
    select 1 from public.observations
    where id=v_observation
      and value_number=123.456
      and quality='user_corrected'
      and provenance->'userCorrectedFields' ? 'value_number'
      and provenance->'userCorrectedFields' ? 'quality'
  ) then raise exception 'observation server correction failed'; end if;

  perform public.server_correct_document(
    v_user,v_document,jsonb_build_object('title','DB-003 corrected imported document'),
    'DB-003 regression document correction'
  );
  if not exists (
    select 1 from public.documents
    where id=v_document
      and title='DB-003 corrected imported document'
      and metadata->'userCorrectedFields' ? 'title'
  ) then raise exception 'document server correction failed'; end if;

  v_expected := false;
  begin
    perform public.server_correct_financial_transaction(
      gen_random_uuid(),v_tx,jsonb_build_object('category','cross-user-illegal'),
      'cross-user test'
    );
  exception when others then
    if sqlerrm='financial transaction not found' then
      v_expected := true;
    else
      raise;
    end if;
  end;
  if not v_expected then raise exception 'server correction accepted mismatched user ownership'; end if;
end
$server$;

reset role;
rollback;

select jsonb_build_object(
  'status','passed',
  'test_residue_documents',(
    select count(*) from public.documents
    where title like 'DB-003 regression%'
       or external_ref='db003-imported-document'
  ),
  'test_residue_corrections',(
    select count(*) from public.fact_corrections
    where correction_reason like 'DB-003 regression%'
  )
) as db_003_transactional_regression;
