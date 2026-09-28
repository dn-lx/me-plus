
create index if not exists activity_summaries_data_source_idx
  on public.activity_summaries(data_source_id);

create index if not exists exercise_sets_exercise_owner_idx
  on public.exercise_sets(workout_exercise_id, user_id);

create index if not exists hydration_events_action_idx
  on public.hydration_events(action_id)
  where action_id is not null;

create index if not exists hydration_events_data_source_idx
  on public.hydration_events(data_source_id)
  where data_source_id is not null;

create index if not exists hydration_events_raw_event_idx
  on public.hydration_events(raw_event_id)
  where raw_event_id is not null;

create index if not exists meal_items_meal_idx
  on public.meal_items(meal_id);

create index if not exists meals_raw_event_idx
  on public.meals(raw_event_id)
  where raw_event_id is not null;

create index if not exists nutrition_estimates_supersedes_idx
  on public.nutrition_estimates(supersedes_id)
  where supersedes_id is not null;

create index if not exists recovery_sessions_action_idx
  on public.recovery_sessions(action_id)
  where action_id is not null;

create index if not exists recovery_sessions_data_source_idx
  on public.recovery_sessions(data_source_id)
  where data_source_id is not null;

create index if not exists recovery_sessions_raw_event_idx
  on public.recovery_sessions(raw_event_id)
  where raw_event_id is not null;

create index if not exists workout_exercises_workout_owner_idx
  on public.workout_exercises(workout_id, user_id);

create index if not exists workouts_data_source_idx
  on public.workouts(data_source_id)
  where data_source_id is not null;

create index if not exists workouts_raw_event_idx
  on public.workouts(raw_event_id)
  where raw_event_id is not null;

drop index if exists public.hydration_events_user_observed_idx;
drop index if exists public.recommendations_user_generated_idx;

drop policy if exists recovery_sessions_select_own on public.recovery_sessions;
drop policy if exists recovery_sessions_insert_own on public.recovery_sessions;
drop policy if exists recovery_sessions_update_own on public.recovery_sessions;
drop policy if exists recovery_sessions_delete_own on public.recovery_sessions;

create policy recovery_sessions_select_own
on public.recovery_sessions
for select
to public
using ((select auth.uid()) = user_id);

create policy recovery_sessions_insert_own
on public.recovery_sessions
for insert
to public
with check ((select auth.uid()) = user_id);

create policy recovery_sessions_update_own
on public.recovery_sessions
for update
to public
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy recovery_sessions_delete_own
on public.recovery_sessions
for delete
to public
using ((select auth.uid()) = user_id);
