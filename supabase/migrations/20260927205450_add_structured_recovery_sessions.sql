create table if not exists public.recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  recovery_type text not null check (recovery_type in ('sauna','cryotherapy','cold_plunge','cold_shower','massage','mobility','other')),
  started_at timestamptz not null,
  ended_at timestamptz null,
  duration_minutes integer null check (duration_minutes is null or duration_minutes >= 0),
  rounds integer null check (rounds is null or rounds > 0),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  capture_method text not null default 'manual',
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  note text null,
  provenance jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  data_source_id uuid null references public.data_sources(id),
  raw_event_id uuid null references public.raw_events(id),
  action_id uuid null references public.actions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recovery_session_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  recovery_session_id uuid not null references public.recovery_sessions(id),
  round_order integer not null default 1 check (round_order > 0),
  duration_seconds integer null check (duration_seconds is null or duration_seconds >= 0),
  temperature_c numeric null,
  intensity_or_setting text null,
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recovery_session_id, round_order)
);

create unique index if not exists recovery_sessions_id_user_uidx on public.recovery_sessions(id, user_id);
create index if not exists recovery_sessions_user_started_idx on public.recovery_sessions(user_id, started_at desc);
create index if not exists recovery_sessions_user_type_started_idx on public.recovery_sessions(user_id, recovery_type, started_at desc);
create index if not exists recovery_rounds_user_session_idx on public.recovery_session_rounds(user_id, recovery_session_id, round_order);

alter table public.recovery_session_rounds
  drop constraint if exists recovery_session_rounds_session_owner_fkey;
alter table public.recovery_session_rounds
  add constraint recovery_session_rounds_session_owner_fkey
  foreign key (recovery_session_id, user_id)
  references public.recovery_sessions(id, user_id);

alter table public.recovery_sessions enable row level security;
alter table public.recovery_session_rounds enable row level security;

drop policy if exists recovery_sessions_select_own on public.recovery_sessions;
drop policy if exists recovery_sessions_insert_own on public.recovery_sessions;
drop policy if exists recovery_sessions_update_own on public.recovery_sessions;
drop policy if exists recovery_sessions_delete_own on public.recovery_sessions;
create policy recovery_sessions_select_own on public.recovery_sessions for select using (user_id = auth.uid());
create policy recovery_sessions_insert_own on public.recovery_sessions for insert with check (user_id = auth.uid());
create policy recovery_sessions_update_own on public.recovery_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recovery_sessions_delete_own on public.recovery_sessions for delete using (user_id = auth.uid());

drop policy if exists recovery_session_rounds_select_own on public.recovery_session_rounds;
drop policy if exists recovery_session_rounds_insert_own on public.recovery_session_rounds;
drop policy if exists recovery_session_rounds_update_own on public.recovery_session_rounds;
drop policy if exists recovery_session_rounds_delete_own on public.recovery_session_rounds;
create policy recovery_session_rounds_select_own on public.recovery_session_rounds for select using (user_id = auth.uid());
create policy recovery_session_rounds_insert_own on public.recovery_session_rounds for insert with check (user_id = auth.uid());
create policy recovery_session_rounds_update_own on public.recovery_session_rounds for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recovery_session_rounds_delete_own on public.recovery_session_rounds for delete using (user_id = auth.uid());
