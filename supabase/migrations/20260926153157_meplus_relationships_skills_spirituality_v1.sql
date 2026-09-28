create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  relationship_context text,
  status text not null default 'active',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  interaction_type text not null,
  occurred_at timestamptz not null,
  context text,
  summary text,
  connection_quality smallint check (connection_quality is null or connection_quality between 1 and 5),
  comfort_level smallint check (comfort_level is null or comfort_level between 1 and 5),
  mutuality_level smallint check (mutuality_level is null or mutuality_level between 1 and 5),
  follow_up_intention text,
  observations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.relationship_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  interaction_id uuid references public.interactions(id) on delete set null,
  reflection_type text not null default 'post_interaction',
  occurred_at timestamptz not null default now(),
  what_worked text,
  what_to_try text,
  connection_learning text,
  mutual_interest_notes text,
  boundary_or_consent_notes text,
  next_step text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  name text not null,
  domain text not null,
  current_level text,
  desired_outcome text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, domain, name)
);

create table public.subskills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  parent_subskill_id uuid references public.subskills(id) on delete set null,
  name text not null,
  description text,
  current_level text,
  priority smallint not null default 3,
  progression_criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(skill_id, name)
);

create table public.skill_drills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subskill_id uuid not null references public.subskills(id) on delete cascade,
  title text not null,
  instructions text not null,
  difficulty text,
  target_definition jsonb not null default '{}'::jsonb,
  normal_minutes integer,
  minimum_minutes integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer,
  perceived_difficulty smallint check (perceived_difficulty is null or perceived_difficulty between 1 and 5),
  performance jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.practice_session_drills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  practice_session_id uuid not null references public.practice_sessions(id) on delete cascade,
  skill_drill_id uuid not null references public.skill_drills(id) on delete restrict,
  duration_minutes integer,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.spiritual_practices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  practice_type text not null,
  intention text,
  normal_minutes integer,
  minimum_minutes integer,
  instructions text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table public.spiritual_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  spiritual_practice_id uuid references public.spiritual_practices(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer,
  intention text,
  experience text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  insight text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index people_user_idx on public.people(user_id);
create index interactions_user_time_idx on public.interactions(user_id, occurred_at desc);
create index interactions_person_time_idx on public.interactions(person_id, occurred_at desc);
create index relationship_reflections_user_time_idx on public.relationship_reflections(user_id, occurred_at desc);
create index skills_user_domain_idx on public.skills(user_id, domain);
create index subskills_user_skill_idx on public.subskills(user_id, skill_id);
create index skill_drills_user_subskill_idx on public.skill_drills(user_id, subskill_id);
create index practice_sessions_user_started_idx on public.practice_sessions(user_id, started_at desc);
create index practice_session_drills_user_session_idx on public.practice_session_drills(user_id, practice_session_id);
create index spiritual_practices_user_type_idx on public.spiritual_practices(user_id, practice_type);
create index spiritual_sessions_user_started_idx on public.spiritual_sessions(user_id, started_at desc);

create trigger people_set_updated_at before update on public.people for each row execute function public.set_updated_at();
create trigger interactions_set_updated_at before update on public.interactions for each row execute function public.set_updated_at();
create trigger relationship_reflections_set_updated_at before update on public.relationship_reflections for each row execute function public.set_updated_at();
create trigger skills_set_updated_at before update on public.skills for each row execute function public.set_updated_at();
create trigger subskills_set_updated_at before update on public.subskills for each row execute function public.set_updated_at();
create trigger skill_drills_set_updated_at before update on public.skill_drills for each row execute function public.set_updated_at();
create trigger practice_sessions_set_updated_at before update on public.practice_sessions for each row execute function public.set_updated_at();
create trigger spiritual_practices_set_updated_at before update on public.spiritual_practices for each row execute function public.set_updated_at();
create trigger spiritual_sessions_set_updated_at before update on public.spiritual_sessions for each row execute function public.set_updated_at();

alter table public.people enable row level security;
alter table public.interactions enable row level security;
alter table public.relationship_reflections enable row level security;
alter table public.skills enable row level security;
alter table public.subskills enable row level security;
alter table public.skill_drills enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_session_drills enable row level security;
alter table public.spiritual_practices enable row level security;
alter table public.spiritual_sessions enable row level security;

create policy people_all on public.people for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy interactions_all on public.interactions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy relationship_reflections_all on public.relationship_reflections for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy skills_all on public.skills for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy subskills_all on public.subskills for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy skill_drills_all on public.skill_drills for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy practice_sessions_all on public.practice_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy practice_session_drills_all on public.practice_session_drills for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy spiritual_practices_all on public.spiritual_practices for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy spiritual_sessions_all on public.spiritual_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.people, public.interactions, public.relationship_reflections, public.skills, public.subskills, public.skill_drills, public.practice_sessions, public.practice_session_drills, public.spiritual_practices, public.spiritual_sessions to authenticated, service_role;
revoke all on public.people, public.interactions, public.relationship_reflections, public.skills, public.subskills, public.skill_drills, public.practice_sessions, public.practice_session_drills, public.spiritual_practices, public.spiritual_sessions from anon;
