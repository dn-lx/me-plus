create or replace function public.reschedule_ai_scheduler_dispatch(
  p_dispatch_id uuid,
  p_error jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
  v_next_status text;
  v_available_at timestamptz;
  v_code text := coalesce(p_error->>'code','');
  v_error_type text := coalesce(p_error->>'error_type','');
begin
  select * into v_dispatch
  from public.scheduler_dispatches
  where id = p_dispatch_id
  for update;

  if not found then raise exception 'scheduler dispatch not found'; end if;
  if v_dispatch.status <> 'claimed' then
    return jsonb_build_object('status',v_dispatch.status,'dispatch_id',v_dispatch.id,'ignored',true);
  end if;

  if v_code in ('credit_balance_exhausted','invalid_api_key','insufficient_quota')
     or v_error_type in ('openai_credentials_missing','openai_billing_blocked') then
    v_next_status := 'blocked';
    v_available_at := v_dispatch.available_at;
  elsif v_dispatch.attempts >= 3 then
    v_next_status := 'failed';
    v_available_at := v_dispatch.available_at;
  else
    v_next_status := 'pending';
    v_available_at := clock_timestamp() + make_interval(mins => greatest(2, least(15, v_dispatch.attempts * 3)));
  end if;

  update public.scheduler_dispatches
  set status = v_next_status,
      available_at = v_available_at,
      claimed_at = null,
      completed_at = case when v_next_status='failed' then clock_timestamp() else null end,
      last_error = coalesce(p_error,'{}'::jsonb),
      updated_at = clock_timestamp()
  where id = v_dispatch.id;

  perform public.record_scheduler_heartbeat(
    v_dispatch.user_id,'ai_reasoning_worker','failed',
    coalesce(v_dispatch.payload->>'policy_version','1.14-draft'),
    coalesce(p_error,'{}'::jsonb),5,10,null,
    'supabase:edge:me-plus-reasoning-worker'
  );

  return jsonb_build_object(
    'dispatch_id',v_dispatch.id,'status',v_next_status,'attempts',v_dispatch.attempts,
    'available_at',v_available_at,'retryable',v_next_status='pending'
  );
end;
$$;

revoke all on function public.reschedule_ai_scheduler_dispatch(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reschedule_ai_scheduler_dispatch(uuid,jsonb) to service_role;

update public.scheduler_dispatches
set status='blocked', claimed_at=null, updated_at=clock_timestamp()
where id='4b1ebb5b-e2c3-488e-8d00-dd8879902def'::uuid
  and status='pending'
  and coalesce(last_error->>'code','')='credit_balance_exhausted';
