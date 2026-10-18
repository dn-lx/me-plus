do $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'meplus_gateway_api_key'
  order by created_at desc
  limit 1;

  if v_secret is null then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_secret,
      'meplus_gateway_api_key',
      'Single-user Me+ gateway credential for authenticated external agent access'
    );
  end if;
end
$$;

create or replace function public.server_authenticate_meplus_gateway(p_api_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
  v_user_id uuid;
  v_profile_count integer;
begin
  if p_api_key is null or length(p_api_key) < 32 then
    return null;
  end if;

  select count(*)::integer into v_profile_count
  from public.profiles;

  if v_profile_count <> 1 then
    return null;
  end if;

  select id into v_user_id
  from public.profiles
  order by created_at
  limit 1;

  select decrypted_secret into v_expected
  from vault.decrypted_secrets
  where name = 'meplus_gateway_api_key'
  order by created_at desc
  limit 1;

  if v_expected is null then
    return null;
  end if;

  if encode(extensions.digest(p_api_key, 'sha256'), 'hex')
     <> encode(extensions.digest(v_expected, 'sha256'), 'hex') then
    return null;
  end if;

  return v_user_id;
end;
$$;

revoke all on function public.server_authenticate_meplus_gateway(text) from public;
revoke all on function public.server_authenticate_meplus_gateway(text) from anon;
revoke all on function public.server_authenticate_meplus_gateway(text) from authenticated;
grant execute on function public.server_authenticate_meplus_gateway(text) to service_role;

comment on function public.server_authenticate_meplus_gateway(text)
is 'Server-only authentication boundary for the single-user Me+ Edge Function gateway. Returns the sole Me+ profile id only when the supplied gateway credential matches the Vault secret.';
