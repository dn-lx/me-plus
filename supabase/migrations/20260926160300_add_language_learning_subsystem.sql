create table public.skill_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  subskill_id uuid references public.subskills(id) on delete set null,
  assessor_type text not null check (assessor_type in ('self','teacher','system','course','other')),
  assessor_ref text,
  assessed_at timestamptz not null default now(),
  level_text text,
  level_number numeric,
  scale text not null default 'custom',
  scale_version text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence jsonb not null default '{}'::jsonb,
  note text,
  source_id uuid references public.data_sources(id) on delete set null,
  created_at timestamptz not null default now()
);

create index skill_assessments_user_skill_time_idx on public.skill_assessments(user_id, skill_id, assessed_at desc);
create index skill_assessments_user_subskill_time_idx on public.skill_assessments(user_id, subskill_id, assessed_at desc) where subskill_id is not null;

create table public.language_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  language_code text not null,
  display_name text not null,
  overall_cefr text check (overall_cefr is null or overall_cefr in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  target_cefr text check (target_cefr is null or target_cefr in ('a1','a2','b1','b2','c1','c2')),
  support_language_code text not null default 'en',
  display_mode text not null default 'target_language_first' check (display_mode in ('target_language_first','balanced','support_language_first')),
  preferred_variant text,
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, language_code),
  unique(skill_id)
);

create index language_profiles_user_active_idx on public.language_profiles(user_id, active);

create table public.language_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language_profile_id uuid not null references public.language_profiles(id) on delete cascade,
  subskill_id uuid references public.subskills(id) on delete set null,
  item_type text not null check (item_type in ('vocabulary','phrase','grammar','pronunciation','listening','reading','writing_pattern','other')),
  canonical_key text,
  content text not null,
  meaning text,
  explanation text,
  example_text text,
  cefr_level text check (cefr_level is null or cefr_level in ('pre_a1','a1','a2','b1','b2','c1','c2')),
  topic text,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index language_items_user_profile_type_idx on public.language_items(user_id, language_profile_id, item_type);
create unique index language_items_profile_canonical_key_uidx on public.language_items(language_profile_id, canonical_key) where canonical_key is not null;

create table public.language_item_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language_profile_id uuid not null references public.language_profiles(id) on delete cascade,
  item_id uuid not null references public.language_items(id) on delete cascade,
  learning_stage text not null default 'new' check (learning_stage in ('new','exposed','recognized','recalled','reliably_used')),
  mastery_score numeric not null default 0 check (mastery_score >= 0 and mastery_score <= 1),
  stability_score numeric check (stability_score is null or (stability_score >= 0 and stability_score <= 1)),
  times_seen integer not null default 0 check (times_seen >= 0),
  times_tested integer not null default 0 check (times_tested >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  incorrect_count integer not null default 0 check (incorrect_count >= 0),
  last_seen_at timestamptz,
  last_tested_at timestamptz,
  next_review_at timestamptz,
  review_interval_days numeric check (review_interval_days is null or review_interval_days >= 0),
  suspended boolean not null default false,
  state_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, item_id)
);

create index language_item_state_due_idx on public.language_item_state(user_id, language_profile_id, next_review_at) where suspended = false;
create index language_item_state_stage_idx on public.language_item_state(user_id, language_profile_id, learning_stage);

create table public.language_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language_profile_id uuid not null references public.language_profiles(id) on delete cascade,
  practice_session_id uuid references public.practice_sessions(id) on delete set null,
  subskill_id uuid references public.subskills(id) on delete set null,
  item_id uuid references public.language_items(id) on delete set null,
  attempt_type text not null,
  prompt_text text,
  response_text text,
  expected_answer text,
  corrected_response text,
  is_correct boolean,
  score numeric check (score is null or (score >= 0 and score <= 1)),
  feedback jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index language_attempts_user_profile_time_idx on public.language_attempts(user_id, language_profile_id, attempted_at desc);
create index language_attempts_user_item_time_idx on public.language_attempts(user_id, item_id, attempted_at desc) where item_id is not null;

create table public.language_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language_profile_id uuid not null references public.language_profiles(id) on delete cascade,
  subskill_id uuid references public.subskills(id) on delete set null,
  error_type text not null,
  error_key text not null,
  description text not null,
  example_incorrect text,
  example_correct text,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','improving','resolved','monitor')),
  severity smallint check (severity is null or (severity between 1 and 5)),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  next_review_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, language_profile_id, error_key)
);

create index language_mistakes_active_idx on public.language_mistakes(user_id, language_profile_id, status, last_seen_at desc);
create index language_mistakes_due_idx on public.language_mistakes(user_id, language_profile_id, next_review_at) where status in ('active','improving','monitor');

create trigger set_language_profiles_updated_at before update on public.language_profiles for each row execute function public.set_updated_at();
create trigger set_language_items_updated_at before update on public.language_items for each row execute function public.set_updated_at();
create trigger set_language_item_state_updated_at before update on public.language_item_state for each row execute function public.set_updated_at();
create trigger set_language_mistakes_updated_at before update on public.language_mistakes for each row execute function public.set_updated_at();

alter table public.skill_assessments enable row level security;
alter table public.language_profiles enable row level security;
alter table public.language_items enable row level security;
alter table public.language_item_state enable row level security;
alter table public.language_attempts enable row level security;
alter table public.language_mistakes enable row level security;

revoke all on table public.skill_assessments, public.language_profiles, public.language_items, public.language_item_state, public.language_attempts, public.language_mistakes from anon, authenticated;
grant select, insert, update, delete on table public.skill_assessments, public.language_profiles, public.language_items, public.language_item_state, public.language_attempts, public.language_mistakes to authenticated;

create policy skill_assessments_select on public.skill_assessments for select to authenticated using ((select auth.uid()) = user_id);
create policy skill_assessments_insert on public.skill_assessments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy skill_assessments_update on public.skill_assessments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy skill_assessments_delete on public.skill_assessments for delete to authenticated using ((select auth.uid()) = user_id);

create policy language_profiles_select on public.language_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy language_profiles_insert on public.language_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy language_profiles_update on public.language_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy language_profiles_delete on public.language_profiles for delete to authenticated using ((select auth.uid()) = user_id);

create policy language_items_select on public.language_items for select to authenticated using ((select auth.uid()) = user_id);
create policy language_items_insert on public.language_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy language_items_update on public.language_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy language_items_delete on public.language_items for delete to authenticated using ((select auth.uid()) = user_id);

create policy language_item_state_select on public.language_item_state for select to authenticated using ((select auth.uid()) = user_id);
create policy language_item_state_insert on public.language_item_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy language_item_state_update on public.language_item_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy language_item_state_delete on public.language_item_state for delete to authenticated using ((select auth.uid()) = user_id);

create policy language_attempts_select on public.language_attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy language_attempts_insert on public.language_attempts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy language_attempts_update on public.language_attempts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy language_attempts_delete on public.language_attempts for delete to authenticated using ((select auth.uid()) = user_id);

create policy language_mistakes_select on public.language_mistakes for select to authenticated using ((select auth.uid()) = user_id);
create policy language_mistakes_insert on public.language_mistakes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy language_mistakes_update on public.language_mistakes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy language_mistakes_delete on public.language_mistakes for delete to authenticated using ((select auth.uid()) = user_id);
