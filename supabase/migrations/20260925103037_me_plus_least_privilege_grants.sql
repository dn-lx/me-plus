
-- Remove broad inherited table privileges and grant only what the client needs.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

grant select, insert, update, delete
on public.profiles,
   public.preferences,
   public.goals,
   public.routines,
   public.routine_schedules,
   public.daily_checkins
to authenticated;

grant select, update
on public.routine_events,
   public.actions
to authenticated;

grant select, insert
on public.recommendation_feedback
to authenticated;

grant select
on public.derived_features,
   public.personal_state_snapshots,
   public.recommendations,
   public.action_events,
   public.outcomes,
   public.current_personal_state_inputs
to authenticated;

-- Future objects in public are private until explicitly exposed.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
