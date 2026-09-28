
-- Remove orphaned functions from the previous projects.
drop function if exists public.ai_manager_enforce_task_project_owner();
drop function if exists public.ai_manager_touch_updated_at();
drop function if exists public.axyveo_touch_updated_at();

-- Parent keys used to enforce same-user ownership across relationships.
alter table public.goals add constraint goals_id_user_id_key unique (id, user_id);
alter table public.routines add constraint routines_id_user_id_key unique (id, user_id);
alter table public.routine_events add constraint routine_events_id_user_id_key unique (id, user_id);
alter table public.personal_state_snapshots add constraint personal_state_snapshots_id_user_id_key unique (id, user_id);
alter table public.recommendations add constraint recommendations_id_user_id_key unique (id, user_id);
alter table public.actions add constraint actions_id_user_id_key unique (id, user_id);

-- A child row may only reference a parent owned by the same user.
alter table public.goals
  add constraint goals_parent_owner_fkey
  foreign key (parent_goal_id, user_id) references public.goals(id, user_id);

alter table public.routines
  add constraint routines_goal_owner_fkey
  foreign key (goal_id, user_id) references public.goals(id, user_id);

alter table public.routine_schedules
  add constraint routine_schedules_routine_owner_fkey
  foreign key (routine_id, user_id) references public.routines(id, user_id);

alter table public.routine_events
  add constraint routine_events_routine_owner_fkey
  foreign key (routine_id, user_id) references public.routines(id, user_id);

alter table public.recommendations
  add constraint recommendations_state_owner_fkey
  foreign key (personal_state_snapshot_id, user_id) references public.personal_state_snapshots(id, user_id);

alter table public.actions
  add constraint actions_goal_owner_fkey
  foreign key (goal_id, user_id) references public.goals(id, user_id),
  add constraint actions_routine_event_owner_fkey
  foreign key (routine_event_id, user_id) references public.routine_events(id, user_id),
  add constraint actions_recommendation_owner_fkey
  foreign key (recommendation_id, user_id) references public.recommendations(id, user_id);

alter table public.action_events
  add constraint action_events_action_owner_fkey
  foreign key (action_id, user_id) references public.actions(id, user_id);

alter table public.recommendation_feedback
  add constraint recommendation_feedback_recommendation_owner_fkey
  foreign key (recommendation_id, user_id) references public.recommendations(id, user_id);

alter table public.outcomes
  add constraint outcomes_action_owner_fkey
  foreign key (action_id, user_id) references public.actions(id, user_id),
  add constraint outcomes_recommendation_owner_fkey
  foreign key (recommendation_id, user_id) references public.recommendations(id, user_id);

-- Tighten semantic data integrity.
alter table public.derived_features drop constraint if exists derived_features_check;
alter table public.derived_features
  add constraint derived_features_exactly_one_value_check
  check (num_nonnulls(value_number, value_text, value_json) = 1),
  add constraint derived_features_window_check
  check (window_end is null or window_start is null or window_end >= window_start);

alter table public.goals
  add constraint goals_date_order_check
  check (target_date is null or starts_on is null or target_date >= starts_on);

alter table public.routine_schedules
  add constraint routine_schedules_date_order_check
  check (ends_on is null or starts_on is null or ends_on >= starts_on);

alter table public.routine_events
  add constraint routine_events_window_check
  check (window_end is null or window_start is null or window_end >= window_start);

alter table public.recommendations
  add constraint recommendations_expiry_check
  check (expires_at is null or expires_at >= generated_at);

alter table public.actions
  add constraint actions_availability_check
  check (due_at is null or available_from is null or due_at >= available_from),
  add constraint actions_plan_window_check
  check (planned_end is null or planned_start is null or planned_end >= planned_start);

-- Secure-by-default for future public objects created by postgres.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
