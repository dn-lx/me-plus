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

create table public.conversation_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid references public.data_sources(id) on delete set null,
  occurred_at timestamptz not null default now(),
  channel text not null default 'chat',
  capture_type text not null default 'conversation',
  summary text,
  content text,
  extracted_data jsonb not null default '{}'::jsonb,
  consent_basis text not null default 'explicit_user_input',
  sensitivity text not null default 'personal',
  processing_status text not null default 'captured',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid references public.data_sources(id) on delete set null,
  entry_type text not null default 'reflection',
  occurred_at timestamptz not null default now(),
  title text,
  content text not null,
  mood smallint,
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.personal_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  fact_key text not null,
  value_json jsonb not null,
  status text not null default 'active',
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1),
  valid_from timestamptz,
  valid_to timestamptz,
  source_refs jsonb not null default '[]'::jsonb,
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, domain, fact_key)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid references public.data_sources(id) on delete set null,
  document_type text not null,
  title text not null,
  provider text,
  external_ref text,
  mime_type text,
  document_date date,
  storage_ref text,
  content_hash text,
  extraction_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  domain text not null,
  fact_key text not null,
  value_json jsonb not null,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_location jsonb not null default '{}'::jsonb,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  actor_type text not null,
  actor_id text,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index data_sources_user_idx on public.data_sources(user_id);
create index source_sync_runs_user_started_idx on public.source_sync_runs(user_id, started_at desc);
create index consents_user_domain_idx on public.consents(user_id, domain);
create index raw_events_user_received_idx on public.raw_events(user_id, received_at desc);
create index observations_user_type_time_idx on public.observations(user_id, observation_type, observed_at desc);
create index observations_user_domain_time_idx on public.observations(user_id, domain, observed_at desc);
create index conversation_captures_user_time_idx on public.conversation_captures(user_id, occurred_at desc);
create index journal_entries_user_time_idx on public.journal_entries(user_id, occurred_at desc);
create index personal_facts_user_domain_idx on public.personal_facts(user_id, domain);
create index documents_user_date_idx on public.documents(user_id, document_date desc nulls last);
create index document_facts_user_domain_idx on public.document_facts(user_id, domain);
create index audit_events_user_time_idx on public.audit_events(user_id, occurred_at desc);

create trigger data_sources_set_updated_at before update on public.data_sources for each row execute function public.set_updated_at();
create trigger consents_set_updated_at before update on public.consents for each row execute function public.set_updated_at();
create trigger observations_set_updated_at before update on public.observations for each row execute function public.set_updated_at();
create trigger conversation_captures_set_updated_at before update on public.conversation_captures for each row execute function public.set_updated_at();
create trigger journal_entries_set_updated_at before update on public.journal_entries for each row execute function public.set_updated_at();
create trigger personal_facts_set_updated_at before update on public.personal_facts for each row execute function public.set_updated_at();
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger document_facts_set_updated_at before update on public.document_facts for each row execute function public.set_updated_at();

alter table public.data_sources enable row level security;
alter table public.source_sync_runs enable row level security;
alter table public.consents enable row level security;
alter table public.raw_events enable row level security;
alter table public.observations enable row level security;
alter table public.conversation_captures enable row level security;
alter table public.journal_entries enable row level security;
alter table public.personal_facts enable row level security;
alter table public.documents enable row level security;
alter table public.document_facts enable row level security;
alter table public.audit_events enable row level security;

create policy data_sources_all on public.data_sources for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy consents_all on public.consents for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy observations_all on public.observations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy conversation_captures_all on public.conversation_captures for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy journal_entries_all on public.journal_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy personal_facts_all on public.personal_facts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy documents_all on public.documents for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy source_sync_runs_select on public.source_sync_runs for select to authenticated using ((select auth.uid()) = user_id);
create policy raw_events_select on public.raw_events for select to authenticated using ((select auth.uid()) = user_id);
create policy document_facts_select on public.document_facts for select to authenticated using ((select auth.uid()) = user_id);
create policy audit_events_select on public.audit_events for select to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.data_sources, public.consents, public.observations, public.conversation_captures, public.journal_entries, public.personal_facts, public.documents to authenticated;
grant select on public.source_sync_runs, public.raw_events, public.document_facts, public.audit_events to authenticated;
grant select, insert, update, delete on public.data_sources, public.source_sync_runs, public.consents, public.raw_events, public.observations, public.conversation_captures, public.journal_entries, public.personal_facts, public.documents, public.document_facts, public.audit_events to service_role;
revoke all on public.data_sources, public.source_sync_runs, public.consents, public.raw_events, public.observations, public.conversation_captures, public.journal_entries, public.personal_facts, public.documents, public.document_facts, public.audit_events from anon;
