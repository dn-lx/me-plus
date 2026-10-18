create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  data_source_id uuid null references public.data_sources(id),
  raw_event_id uuid null references public.raw_events(id),
  started_at timestamptz not null,
  ended_at timestamptz null,
  workout_type text not null default 'other',
  title text null,
  duration_minutes integer null check (duration_minutes is null or duration_minutes >= 0),
  perceived_exertion smallint null check (perceived_exertion between 1 and 10),
  calories_burned_kcal numeric null check (calories_burned_kcal is null or calories_burned_kcal >= 0),
  distance_m numeric null check (distance_m is null or distance_m >= 0),
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  workout_id uuid not null,
  exercise_order integer not null default 1 check (exercise_order > 0),
  exercise_name text not null,
  canonical_exercise_ref text null,
  exercise_type text null,
  duration_seconds integer null check (duration_seconds is null or duration_seconds >= 0),
  distance_m numeric null check (distance_m is null or distance_m >= 0),
  calories_burned_kcal numeric null check (calories_burned_kcal is null or calories_burned_kcal >= 0),
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint workout_exercises_workout_owner_fkey foreign key (workout_id, user_id) references public.workouts(id, user_id)
);

create table public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  workout_exercise_id uuid not null,
  set_order integer not null default 1 check (set_order > 0),
  set_type text not null default 'working',
  reps numeric null check (reps is null or reps >= 0),
  weight_kg numeric null check (weight_kg is null or weight_kg >= 0),
  duration_seconds integer null check (duration_seconds is null or duration_seconds >= 0),
  distance_m numeric null check (distance_m is null or distance_m >= 0),
  rest_seconds integer null check (rest_seconds is null or rest_seconds >= 0),
  rpe numeric null check (rpe is null or (rpe >= 0 and rpe <= 10)),
  rir numeric null check (rir is null or rir >= 0),
  completed boolean not null default true,
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_sets_exercise_owner_fkey foreign key (workout_exercise_id, user_id) references public.workout_exercises(id, user_id)
);

create table public.activity_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  data_source_id uuid null references public.data_sources(id),
  summary_date date not null,
  steps integer null check (steps is null or steps >= 0),
  active_minutes integer null check (active_minutes is null or active_minutes >= 0),
  distance_m numeric null check (distance_m is null or distance_m >= 0),
  active_calories_kcal numeric null check (active_calories_kcal is null or active_calories_kcal >= 0),
  floors_climbed numeric null check (floors_climbed is null or floors_climbed >= 0),
  metadata jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workouts_user_started_idx on public.workouts(user_id, started_at desc);
create index workout_exercises_user_workout_idx on public.workout_exercises(user_id, workout_id, exercise_order);
create index exercise_sets_user_exercise_idx on public.exercise_sets(user_id, workout_exercise_id, set_order);
create index activity_summaries_user_date_idx on public.activity_summaries(user_id, summary_date desc);

create trigger workouts_set_updated_at before update on public.workouts for each row execute function public.set_updated_at();
create trigger workout_exercises_set_updated_at before update on public.workout_exercises for each row execute function public.set_updated_at();
create trigger exercise_sets_set_updated_at before update on public.exercise_sets for each row execute function public.set_updated_at();
create trigger activity_summaries_set_updated_at before update on public.activity_summaries for each row execute function public.set_updated_at();

alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.exercise_sets enable row level security;
alter table public.activity_summaries enable row level security;

create policy workouts_all on public.workouts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_exercises_all on public.workout_exercises for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy exercise_sets_all on public.exercise_sets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy activity_summaries_all on public.activity_summaries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
