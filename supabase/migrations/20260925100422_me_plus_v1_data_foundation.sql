
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text,
 timezone text not null default 'UTC',
 locale text,
 onboarding_completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.goals (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 parent_goal_id uuid references public.goals(id) on delete set null,
 domain text not null,
 title text not null check (char_length(title) between 1 and 200),
 description text,
 status text not null default 'active' check (status in ('active','paused','achieved','abandoned')),
 priority smallint not null default 3 check (priority between 1 and 5),
 starts_on date,
 target_date date,
 target_definition jsonb,
 progress_strategy text,
 motivation text,
 constraints jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz
);

create table public.routines (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 goal_id uuid references public.goals(id) on delete set null,
 domain text not null,
 title text not null check (char_length(title) between 1 and 200),
 instructions text,
 importance smallint not null default 3 check (importance between 1 and 5),
 normal_duration_minutes int check (normal_duration_minutes is null or normal_duration_minutes >= 0),
 reduced_duration_minutes int check (reduced_duration_minutes is null or reduced_duration_minutes >= 0),
 minimum_duration_minutes int check (minimum_duration_minutes is null or minimum_duration_minutes >= 0),
 normal_definition jsonb not null default '{}'::jsonb,
 reduced_definition jsonb,
 minimum_definition jsonb,
 skip_conditions jsonb not null default '{}'::jsonb,
 notification_policy jsonb not null default '{}'::jsonb,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.routine_schedules (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 routine_id uuid not null references public.routines(id) on delete cascade,
 schedule_type text not null,
 rrule text,
 local_time time,
 timezone text,
 window_start_local time,
 window_end_local time,
 schedule_config jsonb not null default '{}'::jsonb,
 starts_on date,
 ends_on date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.routine_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 routine_id uuid not null references public.routines(id) on delete cascade,
 scheduled_for timestamptz not null,
 window_start timestamptz,
 window_end timestamptz,
 status text not null default 'due' check (status in ('due','completed','partial','skipped','missed')),
 selected_version text check (selected_version is null or selected_version in ('full','reduced','minimum')),
 completed_at timestamptz,
 skip_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.daily_checkins (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 checkin_type text not null check (checkin_type in ('morning','evening','ad_hoc')),
 observed_at timestamptz not null default now(),
 mood smallint check (mood between 1 and 5),
 energy smallint check (energy between 1 and 5),
 stress smallint check (stress between 1 and 5),
 soreness smallint check (soreness between 1 and 5),
 sleep_quality smallint check (sleep_quality between 1 and 5),
 note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.derived_features (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 feature_key text not null,
 as_of timestamptz not null,
 window_start timestamptz,
 window_end timestamptz,
 value_number double precision,
 value_text text,
 value_json jsonb,
 unit text,
 quality text,
 method_version text not null,
 input_refs jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),
 check (num_nonnulls(value_number,value_text,value_json) >= 1)
);

create table public.personal_state_snapshots (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 state_type text not null default 'daily',
 as_of timestamptz not null,
 schema_version text not null,
 state jsonb not null,
 input_refs jsonb not null default '[]'::jsonb,
 builder_version text not null,
 created_at timestamptz not null default now()
);

create table public.recommendations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 personal_state_snapshot_id uuid references public.personal_state_snapshots(id) on delete set null,
 recommendation_type text not null,
 domain text not null,
 generated_at timestamptz not null default now(),
 expires_at timestamptz,
 title text not null,
 rationale text not null,
 confidence text not null check (confidence in ('high','medium','experimental','insufficient_data')),
 priority smallint check (priority is null or priority between 1 and 5),
 proposed_action jsonb not null default '{}'::jsonb,
 evidence jsonb not null default '[]'::jsonb,
 constraints_considered jsonb not null default '[]'::jsonb,
 policy_version text not null,
 model_provider text,
 model_name text,
 model_version text,
 prompt_contract_version text,
 created_at timestamptz not null default now()
);

create table public.actions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 goal_id uuid references public.goals(id) on delete set null,
 routine_event_id uuid references public.routine_events(id) on delete set null,
 recommendation_id uuid references public.recommendations(id) on delete set null,
 domain text not null,
 origin text not null,
 title text not null,
 instructions text,
 priority text not null check (priority in ('must','should','bonus')),
 version text not null default 'full' check (version in ('full','reduced','minimum')),
 status text not null default 'proposed' check (status in ('proposed','planned','available','in_progress','completed','partial','skipped','cancelled','expired')),
 estimated_minutes int check (estimated_minutes is null or estimated_minutes >= 0),
 available_from timestamptz,
 due_at timestamptz,
 planned_start timestamptz,
 planned_end timestamptz,
 reason text,
 constraint_flags jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.action_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 action_id uuid not null references public.actions(id) on delete cascade,
 event_type text not null,
 occurred_at timestamptz not null default now(),
 reason_code text,
 note text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create table public.recommendation_feedback (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 recommendation_id uuid not null references public.recommendations(id) on delete cascade,
 decision text check (decision is null or decision in ('accepted','dismissed','ignored')),
 helpfulness smallint check (helpfulness is null or helpfulness between 1 and 5),
 reason_code text,
 note text,
 recorded_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);

create table public.outcomes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 action_id uuid references public.actions(id) on delete set null,
 recommendation_id uuid references public.recommendations(id) on delete set null,
 outcome_type text not null,
 observed_at timestamptz not null,
 subjective_value jsonb,
 objective_refs jsonb,
 summary text,
 created_at timestamptz not null default now()
);

create index goals_user_idx on public.goals(user_id);
create index routines_user_idx on public.routines(user_id);
create index routine_schedules_user_idx on public.routine_schedules(user_id);
create index routine_events_user_time_idx on public.routine_events(user_id, scheduled_for desc, status);
create index checkins_user_time_idx on public.daily_checkins(user_id, observed_at desc);
create index features_user_key_time_idx on public.derived_features(user_id, feature_key, as_of desc);
create index states_user_type_time_idx on public.personal_state_snapshots(user_id, state_type, as_of desc);
create index recommendations_user_time_idx on public.recommendations(user_id, generated_at desc);
create index actions_user_status_due_idx on public.actions(user_id, status, due_at);
create index action_events_user_time_idx on public.action_events(user_id, occurred_at desc);
create index recommendation_feedback_user_idx on public.recommendation_feedback(user_id);
create index outcomes_user_time_idx on public.outcomes(user_id, observed_at desc);

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger goals_updated before update on public.goals for each row execute function public.set_updated_at();
create trigger routines_updated before update on public.routines for each row execute function public.set_updated_at();
create trigger routine_schedules_updated before update on public.routine_schedules for each row execute function public.set_updated_at();
create trigger routine_events_updated before update on public.routine_events for each row execute function public.set_updated_at();
create trigger daily_checkins_updated before update on public.daily_checkins for each row execute function public.set_updated_at();
create trigger actions_updated before update on public.actions for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.routines enable row level security;
alter table public.routine_schedules enable row level security;
alter table public.routine_events enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.derived_features enable row level security;
alter table public.personal_state_snapshots enable row level security;
alter table public.recommendations enable row level security;
alter table public.actions enable row level security;
alter table public.action_events enable row level security;
alter table public.recommendation_feedback enable row level security;
alter table public.outcomes enable row level security;

grant select,insert,update,delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

create policy profiles_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete on public.profiles for delete to authenticated using ((select auth.uid()) = id);

DO $$
DECLARE t text;
BEGIN
FOREACH t IN ARRAY ARRAY['goals','routines','routine_schedules','routine_events','daily_checkins','derived_features','personal_state_snapshots','recommendations','actions','action_events','recommendation_feedback','outcomes']
LOOP
 EXECUTE format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t||'_select',t);
 EXECUTE format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t||'_insert',t);
 EXECUTE format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t||'_update',t);
 EXECUTE format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t||'_delete',t);
END LOOP;
END $$;
