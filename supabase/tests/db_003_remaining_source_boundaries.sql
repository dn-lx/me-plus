begin;

with owner as (
  select p.id user_id, ds.id data_source_id
  from public.profiles p
  join public.data_sources ds on ds.user_id=p.id and ds.kind <> 'manual'
  order by p.created_at,ds.created_at
  limit 1
)
insert into public.calendar_events(
  user_id,data_source_id,external_event_id,title,starts_at,ends_at,status,busy,metadata
)
select user_id,data_source_id,'db003-calendar-source','DB-003 source calendar',
       clock_timestamp(),clock_timestamp()+interval '1 hour','confirmed',true,'{}'::jsonb
from owner;

with owner as (
  select p.id user_id, ds.id data_source_id
  from public.profiles p
  join public.data_sources ds on ds.user_id=p.id and ds.kind <> 'manual'
  order by p.created_at,ds.created_at
  limit 1
)
insert into public.journal_entries(
  user_id,data_source_id,entry_type,occurred_at,title,content,metadata
)
select user_id,data_source_id,'reflection',clock_timestamp(),'DB-003 source journal',
       'source-backed regression fixture','{}'::jsonb
from owner;

with owner as (
  select p.id user_id, ds.id data_source_id
  from public.profiles p
  join public.data_sources ds on ds.user_id=p.id and ds.kind <> 'manual'
  order by p.created_at,ds.created_at
  limit 1
)
insert into public.meals(
  user_id,data_source_id,eaten_at,meal_type,title,capture_method,provenance
)
select user_id,data_source_id,clock_timestamp(),'snack','DB-003 source meal','integration','{}'::jsonb
from owner;

with owner as (
  select p.id user_id, ds.id data_source_id
  from public.profiles p
  join public.data_sources ds on ds.user_id=p.id and ds.kind <> 'manual'
  order by p.created_at,ds.created_at
  limit 1
)
insert into public.hydration_events(
  user_id,data_source_id,observed_at,beverage_type,amount_ml,capture_method,provenance
)
select user_id,data_source_id,clock_timestamp(),'water',250,'integration','{}'::jsonb
from owner;

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
  v_expected boolean;
  v_manual_calendar uuid;
  v_manual_capture uuid;
  v_manual_journal uuid;
  v_manual_meal uuid;
  v_manual_hydration uuid;
  v_source_capture uuid;
  v_consent uuid;
begin
  if v_user is null then raise exception 'authenticated test user missing'; end if;

  update public.calendar_events set title='illegal source calendar update'
  where user_id=v_user and external_event_id='db003-calendar-source';
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'source-backed calendar update was allowed'; end if;

  update public.journal_entries set title='illegal source journal update'
  where user_id=v_user and title='DB-003 source journal';
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'source-backed journal update was allowed'; end if;

  update public.meals set title='illegal source meal update'
  where user_id=v_user and title='DB-003 source meal';
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'source-backed meal update was allowed'; end if;

  update public.hydration_events set amount_ml=999
  where user_id=v_user and capture_method='integration';
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'source-backed hydration update was allowed'; end if;

  select id into v_source_capture from public.conversation_captures
  where user_id=v_user and data_source_id is not null
  order by created_at limit 1;
  if v_source_capture is null then raise exception 'source-backed conversation capture fixture missing'; end if;

  update public.conversation_captures set summary='illegal source capture update'
  where id=v_source_capture;
  get diagnostics v_rows=row_count;
  if v_rows <> 0 then raise exception 'source-backed conversation capture update was allowed'; end if;

  select id into v_consent from public.consents
  where user_id=v_user and data_source_id is not null
  order by created_at limit 1;
  if v_consent is null then raise exception 'source-backed consent fixture missing'; end if;

  v_expected := false;
  begin
    update public.consents set status='revoked' where id=v_consent;
  exception when insufficient_privilege then v_expected := true;
  end;
  if not v_expected then raise exception 'client consent mutation was not denied'; end if;

  v_expected := false;
  begin
    insert into public.consents(user_id,domain,purpose,status)
    values(v_user,'test','db003','granted');
  exception when insufficient_privilege then v_expected := true;
  end;
  if not v_expected then raise exception 'client consent insert was not denied'; end if;

  v_expected := false;
  begin
    update public.calendar_events set data_source_id=null
    where user_id=v_user and external_event_id='db003-calendar-source';
  exception when insufficient_privilege then v_expected := true;
  end;
  if not v_expected then raise exception 'calendar source identity was writable'; end if;

  insert into public.calendar_events(
    user_id,title,starts_at,ends_at,status,busy,metadata
  ) values (
    v_user,'DB-003 manual calendar',clock_timestamp(),clock_timestamp()+interval '30 minutes',
    'confirmed',true,'{}'::jsonb
  ) returning id into v_manual_calendar;
  update public.calendar_events set title='DB-003 manual calendar updated' where id=v_manual_calendar;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual calendar update was blocked'; end if;

  insert into public.conversation_captures(
    user_id,occurred_at,channel,capture_type,summary,content,extracted_data,consent_basis,sensitivity
  ) values (
    v_user,clock_timestamp(),'chat','conversation','DB-003 manual capture',
    'manual capture','{}'::jsonb,'explicit_user_input','personal'
  ) returning id into v_manual_capture;
  update public.conversation_captures set summary='DB-003 manual capture updated' where id=v_manual_capture;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual conversation capture update was blocked'; end if;

  insert into public.journal_entries(
    user_id,entry_type,occurred_at,title,content,metadata
  ) values (
    v_user,'reflection',clock_timestamp(),'DB-003 manual journal','manual journal','{}'::jsonb
  ) returning id into v_manual_journal;
  update public.journal_entries set title='DB-003 manual journal updated' where id=v_manual_journal;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual journal update was blocked'; end if;

  insert into public.meals(
    user_id,eaten_at,meal_type,title,capture_method,provenance
  ) values (
    v_user,clock_timestamp(),'snack','DB-003 manual meal','manual','{}'::jsonb
  ) returning id into v_manual_meal;
  update public.meals set title='DB-003 manual meal updated' where id=v_manual_meal;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual meal update was blocked'; end if;

  insert into public.hydration_events(
    user_id,observed_at,beverage_type,amount_ml,capture_method,provenance
  ) values (
    v_user,clock_timestamp(),'water',300,'manual','{}'::jsonb
  ) returning id into v_manual_hydration;
  update public.hydration_events set amount_ml=350 where id=v_manual_hydration;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual hydration update was blocked'; end if;

  delete from public.calendar_events where id=v_manual_calendar;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual calendar delete was blocked'; end if;
  delete from public.conversation_captures where id=v_manual_capture;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual capture delete was blocked'; end if;
  delete from public.journal_entries where id=v_manual_journal;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual journal delete was blocked'; end if;
  delete from public.meals where id=v_manual_meal;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual meal delete was blocked'; end if;
  delete from public.hydration_events where id=v_manual_hydration;
  get diagnostics v_rows=row_count;
  if v_rows <> 1 then raise exception 'manual hydration delete was blocked'; end if;

  if has_any_column_privilege('authenticated','public.workouts','INSERT,UPDATE')
     or has_table_privilege('authenticated','public.workouts','DELETE') then
    raise exception 'workouts unexpectedly writable by authenticated';
  end if;
  if has_any_column_privilege('authenticated','public.recovery_sessions','INSERT,UPDATE')
     or has_table_privilege('authenticated','public.recovery_sessions','DELETE') then
    raise exception 'recovery_sessions unexpectedly writable by authenticated';
  end if;
  if has_any_column_privilege('authenticated','public.activity_summaries','INSERT,UPDATE')
     or has_table_privilege('authenticated','public.activity_summaries','DELETE') then
    raise exception 'activity_summaries unexpectedly writable by authenticated';
  end if;
end
$client$;

reset role;
rollback;

select jsonb_build_object(
  'status','passed',
  'calendar_fixture_residue',(select count(*) from public.calendar_events where external_event_id='db003-calendar-source' or title like 'DB-003 manual calendar%'),
  'journal_fixture_residue',(select count(*) from public.journal_entries where title like 'DB-003 %journal%'),
  'meal_fixture_residue',(select count(*) from public.meals where title like 'DB-003 %meal%'),
  'hydration_fixture_residue',(select count(*) from public.hydration_events where capture_method='integration' and amount_ml=250)
) as db_003_remaining_boundaries_regression;
