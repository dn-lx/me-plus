
create or replace function public.reschedule_meplus_native_action(p_action_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_action public.actions%rowtype;
  v_available timestamptz;
  v_due timestamptz;
  v_request uuid;
  v_prior_action uuid;
  v_event_id uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_action_id is null or p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'invalid reschedule input' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_changes) as k(key)
    where k.key not in ('available_from','due_at','request_id')
  ) then
    raise exception 'unsupported reschedule field' using errcode = '22023';
  end if;
  if not (p_changes ? 'available_from' or p_changes ? 'due_at') then
    raise exception 'scheduling change required' using errcode = '22023';
  end if;
  v_request := nullif(p_changes->>'request_id','')::uuid;
  if v_request is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':native-reschedule:' || v_request::text, 0));
    select e.action_id into v_prior_action from public.action_events e
    where e.user_id=v_user and e.event_type='rescheduled' and e.metadata->>'request_id'=v_request::text
    limit 1;
    if v_prior_action is not null then
      if v_prior_action <> p_action_id then
        raise exception 'request ID already used' using errcode = '23505';
      end if;
      return jsonb_build_object('ok',true,'replayed',true,'action_id',p_action_id);
    end if;
  end if;
  select * into v_action
  from public.actions
  where id=p_action_id and user_id=v_user
  for update;
  if not found then
    raise exception 'action not found' using errcode = 'P0002';
  end if;
  if v_action.status not in ('proposed','planned','available','in_progress','partial') then
    raise exception 'action not open' using errcode = '22023';
  end if;
  if v_action.routine_event_id is not null then
    raise exception 'routine occurrence requires routine scheduling flow' using errcode = '22023';
  end if;
  v_available := case when p_changes ? 'available_from'
    then nullif(p_changes->>'available_from','')::timestamptz else v_action.available_from end;
  v_due := case when p_changes ? 'due_at'
    then nullif(p_changes->>'due_at','')::timestamptz else v_action.due_at end;
  if v_available is not null and v_due is not null and v_due < v_available then
    raise exception 'due time precedes availability' using errcode = '22023';
  end if;
  if v_available is not distinct from v_action.available_from
    and v_due is not distinct from v_action.due_at then
    return jsonb_build_object('ok',true,'replayed',true,'action_id',p_action_id,'no_change',true);
  end if;
  update public.actions
  set available_from=v_available, due_at=v_due, updated_at=clock_timestamp()
  where id=p_action_id and user_id=v_user;
  insert into public.action_events(user_id,action_id,event_type,occurred_at,metadata)
  values (v_user,p_action_id,'rescheduled',clock_timestamp(),
    jsonb_build_object('source','meplus_native','request_id',v_request,'contract_version','native-actions-v1',
      'previous_available_from',v_action.available_from,'previous_due_at',v_action.due_at,
      'new_available_from',v_available,'new_due_at',v_due))
  returning id into v_event_id;
  return jsonb_build_object('ok',true,'replayed',false,'action_id',p_action_id,'event_id',v_event_id);
end;
$fn$;
revoke all on function public.reschedule_meplus_native_action(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reschedule_meplus_native_action(uuid,jsonb) to authenticated;
