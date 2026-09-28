create or replace function public.get_ai_reasoning_context(
  p_user_id uuid,
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'personal_state', public.build_personal_state(p_user_id,p_as_of),
    'recent_actions', public.get_recent_actions(p_user_id,40),
    'recommendation_history', public.get_recommendation_history(p_user_id,24),
    'pending_scheduler_signals', public.get_pending_scheduler_signals(p_user_id,20)
  );
$$;

revoke all on function public.get_ai_reasoning_context(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.get_ai_reasoning_context(uuid,timestamptz) to service_role;
