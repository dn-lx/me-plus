
create index action_events_action_user_idx on public.action_events(action_id, user_id);
create index actions_goal_user_idx on public.actions(goal_id, user_id);
create index actions_recommendation_user_idx on public.actions(recommendation_id, user_id);
create index actions_routine_event_user_idx on public.actions(routine_event_id, user_id);
create index goals_parent_user_idx on public.goals(parent_goal_id, user_id);
create index outcomes_action_user_idx on public.outcomes(action_id, user_id);
create index outcomes_recommendation_user_idx on public.outcomes(recommendation_id, user_id);
create index recommendation_feedback_recommendation_user_idx on public.recommendation_feedback(recommendation_id, user_id);
create index recommendations_state_user_idx on public.recommendations(personal_state_snapshot_id, user_id);
create index routine_events_routine_user_idx on public.routine_events(routine_id, user_id);
create index routine_schedules_routine_user_idx on public.routine_schedules(routine_id, user_id);
create index routines_goal_user_idx on public.routines(goal_id, user_id);
