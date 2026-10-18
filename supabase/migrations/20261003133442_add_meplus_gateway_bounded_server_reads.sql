grant select on table public.profiles to service_role;
grant select on table public.daily_checkins to service_role;
grant select on table public.goals to service_role;
grant select on table public.routines to service_role;
grant select on table public.routine_schedules to service_role;

create or replace function public.server_gateway_build_personal_state(
  p_user_id uuid,
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.build_personal_state(p_user_id,p_as_of);
$$;

create or replace function public.server_gateway_get_active_goals(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_active_goals(p_user_id);
$$;

create or replace function public.server_gateway_get_due_routines(
  p_user_id uuid,
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_due_routines(p_user_id,p_as_of);
$$;

create or replace function public.server_gateway_get_recent_actions(
  p_user_id uuid,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_recent_actions(p_user_id,p_limit);
$$;

create or replace function public.server_gateway_get_recommendation_history(
  p_user_id uuid,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_recommendation_history(p_user_id,p_limit);
$$;

revoke all on function public.server_gateway_build_personal_state(uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.server_gateway_get_active_goals(uuid) from public, anon, authenticated;
revoke all on function public.server_gateway_get_due_routines(uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.server_gateway_get_recent_actions(uuid,integer) from public, anon, authenticated;
revoke all on function public.server_gateway_get_recommendation_history(uuid,integer) from public, anon, authenticated;

grant execute on function public.server_gateway_build_personal_state(uuid,timestamptz) to service_role;
grant execute on function public.server_gateway_get_active_goals(uuid) to service_role;
grant execute on function public.server_gateway_get_due_routines(uuid,timestamptz) to service_role;
grant execute on function public.server_gateway_get_recent_actions(uuid,integer) to service_role;
grant execute on function public.server_gateway_get_recommendation_history(uuid,integer) to service_role;
