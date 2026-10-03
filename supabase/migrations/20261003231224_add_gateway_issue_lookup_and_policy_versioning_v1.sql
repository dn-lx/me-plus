create or replace function public.server_gateway_get_engineering_issue(p_issue_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(e)
  from private.engineering_issues e
  where e.issue_key=upper(btrim(p_issue_key))
  limit 1;
$$;

revoke all on function public.server_gateway_get_engineering_issue(text) from public, anon, authenticated;
grant execute on function public.server_gateway_get_engineering_issue(text) to service_role;

create or replace function public.server_gateway_get_scheduler_policy(
  p_user_id uuid,
  p_policy_key text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select to_jsonb(p)
  from public.scheduler_policies p
  where p.user_id=p_user_id
    and p.policy_key=btrim(p_policy_key)
    and p.status='active'
  order by p.effective_from desc
  limit 1;
$$;

revoke all on function public.server_gateway_get_scheduler_policy(uuid,text) from public, anon, authenticated;
grant execute on function public.server_gateway_get_scheduler_policy(uuid,text) to service_role;

create or replace function public.server_gateway_version_scheduler_policy(
  p_user_id uuid,
  p_policy_key text,
  p_expected_current_version text,
  p_new_version text,
  p_new_policy jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.scheduler_policies%rowtype;
  v_new public.scheduler_policies%rowtype;
  v_checksum text;
begin
  if p_user_id is null then raise exception 'user_id_required'; end if;
  if btrim(coalesce(p_policy_key,''))='' then raise exception 'policy_key_required'; end if;
  if btrim(coalesce(p_new_version,''))='' then raise exception 'new_version_required'; end if;
  if jsonb_typeof(p_new_policy) <> 'object' then raise exception 'new_policy_must_be_object'; end if;

  select * into v_current
  from public.scheduler_policies
  where user_id=p_user_id
    and policy_key=btrim(p_policy_key)
    and status='active'
  for update;

  if not found then raise exception 'active_policy_not_found:%', p_policy_key; end if;

  if btrim(coalesce(p_expected_current_version,''))<>'' and v_current.policy_version<>p_expected_current_version then
    raise exception 'scheduler_policy_version_conflict:expected=% current=%',
      p_expected_current_version, v_current.policy_version;
  end if;

  if v_current.policy_version=p_new_version then
    raise exception 'scheduler_policy_new_version_must_differ';
  end if;

  if coalesce(p_new_policy->>'source_spec_version','')<>p_new_version then
    raise exception 'source_spec_version_must_match_new_version';
  end if;

  v_checksum := encode(extensions.digest(p_new_policy::text,'sha256'),'hex');

  update public.scheduler_policies
  set status='retired', updated_at=now()
  where id=v_current.id;

  insert into public.scheduler_policies(
    user_id,policy_key,policy_version,status,
    source_document_id,source_document_title,effective_from,
    policy,supersedes_id,policy_schema_version,policy_checksum
  )
  values(
    p_user_id,v_current.policy_key,p_new_version,'active',
    v_current.source_document_id,v_current.source_document_title,clock_timestamp(),
    p_new_policy,v_current.id,v_current.policy_schema_version,v_checksum
  )
  returning * into v_new;

  return to_jsonb(v_new);
end;
$$;

revoke all on function public.server_gateway_version_scheduler_policy(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.server_gateway_version_scheduler_policy(uuid,text,text,text,jsonb) to service_role;
