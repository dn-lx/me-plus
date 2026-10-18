
revoke insert, update, delete on public.derived_features from authenticated;
revoke insert, update, delete on public.personal_state_snapshots from authenticated;
revoke insert, update, delete on public.recommendations from authenticated;
revoke insert, update, delete on public.action_events from authenticated;
revoke insert, update, delete on public.outcomes from authenticated;

grant select on public.derived_features,
                public.personal_state_snapshots,
                public.recommendations,
                public.action_events,
                public.outcomes to authenticated;

grant select, insert, update, delete on public.derived_features,
                                        public.personal_state_snapshots,
                                        public.recommendations,
                                        public.action_events,
                                        public.outcomes to service_role;

drop policy if exists derived_features_insert on public.derived_features;
drop policy if exists derived_features_update on public.derived_features;
drop policy if exists derived_features_delete on public.derived_features;
drop policy if exists personal_state_snapshots_insert on public.personal_state_snapshots;
drop policy if exists personal_state_snapshots_update on public.personal_state_snapshots;
drop policy if exists personal_state_snapshots_delete on public.personal_state_snapshots;
drop policy if exists recommendations_insert on public.recommendations;
drop policy if exists recommendations_update on public.recommendations;
drop policy if exists recommendations_delete on public.recommendations;
drop policy if exists action_events_insert on public.action_events;
drop policy if exists action_events_update on public.action_events;
drop policy if exists action_events_delete on public.action_events;
drop policy if exists outcomes_insert on public.outcomes;
drop policy if exists outcomes_update on public.outcomes;
drop policy if exists outcomes_delete on public.outcomes;

revoke insert, delete on public.actions from authenticated;
revoke insert, delete on public.routine_events from authenticated;
grant select, update on public.actions, public.routine_events to authenticated;
grant select, insert, update, delete on public.actions, public.routine_events to service_role;
drop policy if exists actions_insert on public.actions;
drop policy if exists actions_delete on public.actions;
drop policy if exists routine_events_insert on public.routine_events;
drop policy if exists routine_events_delete on public.routine_events;

revoke update, delete on public.recommendation_feedback from authenticated;
grant select, insert on public.recommendation_feedback to authenticated;
grant select, insert, update, delete on public.recommendation_feedback to service_role;
drop policy if exists recommendation_feedback_update on public.recommendation_feedback;
drop policy if exists recommendation_feedback_delete on public.recommendation_feedback;

create or replace view public.current_personal_state_inputs
with (security_invoker = true)
as
select
  p.id as user_id,
  (select count(*) from public.goals g
    where g.user_id = p.id and g.status = 'active') as active_goal_count,
  (select count(*) from public.routine_events e
    where e.user_id = p.id
      and e.status = 'due'
      and e.scheduled_for <= now() + interval '1 day') as due_routine_count,
  c.observed_at as latest_checkin_at,
  c.mood,
  c.energy,
  c.stress,
  c.soreness,
  c.sleep_quality,
  (select count(*) from public.actions a
    where a.user_id = p.id
      and a.status = 'completed'
      and a.updated_at >= now() - interval '7 days') as completed_actions_7d,
  (select count(*) from public.actions a
    where a.user_id = p.id
      and a.status = 'partial'
      and a.updated_at >= now() - interval '7 days') as partial_actions_7d,
  (select count(*) from public.actions a
    where a.user_id = p.id
      and a.status = 'skipped'
      and a.updated_at >= now() - interval '7 days') as skipped_actions_7d
from public.profiles p
left join lateral (
  select
    d.observed_at,
    d.mood,
    d.energy,
    d.stress,
    d.soreness,
    d.sleep_quality
  from public.daily_checkins d
  where d.user_id = p.id
  order by d.observed_at desc
  limit 1
) c on true;

revoke all on public.current_personal_state_inputs from anon;
grant select on public.current_personal_state_inputs to authenticated;
