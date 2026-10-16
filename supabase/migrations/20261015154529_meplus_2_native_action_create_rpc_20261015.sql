
create or replace function public.create_meplus_native_action(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_title text;
  v_domain text;
  v_priority text;
  v_minutes integer;
  v_available timestamptz;
  v_due timestamptz;
  v_request uuid;
  v_existing uuid;
  v_action public.actions%rowtype;
  v_event_id uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'invalid action input' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_input) as k(key)
    where k.key not in ('title','domain','priority','estimated_minutes','available_from','due_at','request_id')
  ) then
    raise exception 'unsupported action field' using errcode = '22023';
  end if;
  v_title := btrim(coalesce(p_input->>'title',''));
  v_domain := btrim(coalesce(nullif(p_input->>'domain',''),'personal'));
  v_priority := coalesce(nullif(p_input->>'priority',''),'should');
  v_minutes := nullif(p_input->>'estimated_minutes','')::integer;
  v_available := nullif(p_input->>'available_from','')::timestamptz;
  v_due := nullif(p_input->>'due_at','')::timestamptz;
  v_request := nullif(p_input->>'request_id','')::uuid;
  if length(v_title) < 1 or length(v_title) > 200
    or length(v_domain) < 1 or length(v_domain) > 60
    or v_priority not in ('must','should','bonus')
    or (v_minutes is not null and (v_minutes < 0 or v_minutes > 1440))
    or (v_available is not null and v_due is not null and v_due < v_available)
  then
    raise exception 'invalid action fields or time window' using errcode = '22023';
  end if;
  if v_request is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':native-create:' || v_request::text, 0));
    select e.action_id into v_existing
    from public.action_events e
    where e.user_id = v_user and e.event_type='created' and e.metadata->>'request_id'=v_request::text
    limit 1;
    if v_existing is not null then
      return jsonb_build_object('ok',true,'replayed',true,'action_id',v_existing);
    end if;
  end if;
  insert into public.actions
    (user_id,origin,title,domain,priority,version,status,estimated_minutes,available_from,due_at,constraint_flags)
  values
    (v_user,'manual',v_title,v_domain,v_priority,'full','planned',v_minutes,v_available,v_due,'{}'::jsonb)
  returning * into v_action;
  insert into public.action_events
    (user_id,action_id,event_type,occurred_at,metadata)
  values
    (v_user,v_action.id,'created',clock_timestamp(),
       jsonb_build_object('source','meplus_native','request_id',v_request,'contract_version','native-actions-v1'))
  returning id into v_event_id;
  return jsonb_build_object('ok',true,'replayed',false,'action_id',v_action.id,'event_id',v_event_id);
end;
$fn$;
revoke all on function public.create_meplus_native_action(jsonb) from public, anon, authenticated;
grant execute on function public.create_meplus_native_action(jsonb) to authenticated;

