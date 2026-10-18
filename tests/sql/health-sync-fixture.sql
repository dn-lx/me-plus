-- Disposable isolated schema only; never run against a hosted project.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
insert into auth.users values ('459ab99b-d99d-492b-bb23-95144dbb1e47');
create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  provider text not null,
  display_name text not null,
  status text not null default 'active',
  external_account_ref text,
  last_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider, display_name)
);

create table public.source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  cursor_after text,
  records_seen integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid references public.data_sources(id) on delete set null,
  domain text not null,
  purpose text not null,
  status text not null default 'pending' check (status in ('granted','revoked','pending')),
  granted_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.raw_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  external_record_id text,
  event_type text not null,
  observed_at timestamptz,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  payload_schema_version text not null default '1',
  content_hash text,
  processing_status text not null default 'pending',
  processed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now()
);
create unique index raw_events_source_external_uidx on public.raw_events(data_source_id, external_record_id) where external_record_id is not null;

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid references public.data_sources(id) on delete set null,
  raw_event_id uuid references public.raw_events(id) on delete set null,
  domain text not null,
  observation_type text not null,
  observed_at timestamptz not null,
  value_number double precision,
  value_text text,
  value_boolean boolean,
  value_json jsonb,
  unit text,
  quality text,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(value_number, value_text, value_boolean, value_json) >= 1)
);


create table private.source_sync_leases (
user_id uuid not null, data_source_id uuid not null, sync_purpose text not null,
run_key text not null, sync_run_id uuid not null, attempt integer not null,
max_attempts integer not null, acquired_at timestamptz not null default now(),
expires_at timestamptz not null, updated_at timestamptz not null default now(),
primary key(user_id,data_source_id,sync_purpose));
create unique index source_sync_one_running on public.source_sync_runs(data_source_id) where status='running';
