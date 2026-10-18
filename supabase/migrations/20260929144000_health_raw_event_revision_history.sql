create table if not exists public.raw_event_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete cascade,
  external_record_id text not null,
  provider_last_modified_at timestamptz not null,
  observed_at timestamptz,
  revision_key text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint raw_event_revisions_revision_key_not_blank
    check (length(btrim(revision_key)) > 0),
  constraint raw_event_revisions_source_external_revision_uidx
    unique (data_source_id, external_record_id, revision_key)
);

comment on table public.raw_event_revisions is
  'Append-only provider revision history for source records whose stable external ID may be revised. raw_events remains the canonical latest provider record used for normalization.';

create index if not exists raw_event_revisions_user_received_idx
  on public.raw_event_revisions(user_id, received_at desc);

create index if not exists raw_event_revisions_source_external_modified_idx
  on public.raw_event_revisions(data_source_id, external_record_id, provider_last_modified_at desc);

alter table public.raw_event_revisions enable row level security;

drop policy if exists raw_event_revisions_select on public.raw_event_revisions;
create policy raw_event_revisions_select
  on public.raw_event_revisions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.raw_event_revisions from anon, authenticated;
grant select on table public.raw_event_revisions to authenticated;
grant all on table public.raw_event_revisions to service_role;
