
create table if not exists public.interaction_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  interface text not null default 'chatgpt',
  external_session_ref text,
  session_type text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active'
    check (status in ('active','closed','superseded')),
  domains text[] not null default '{}'::text[],
  summary text,
  decisions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(decisions) = 'array'),
  new_facts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(new_facts) = 'array'),
  corrections jsonb not null default '[]'::jsonb
    check (jsonb_typeof(corrections) = 'array'),
  open_loops jsonb not null default '[]'::jsonb
    check (jsonb_typeof(open_loops) = 'array'),
  next_actions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(next_actions) = 'array'),
  entity_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(entity_refs) = 'array'),
  document_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(document_refs) = 'array'),
  source_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_refs) = 'array'),
  personal_state_snapshot_id uuid,
  supersedes_id uuid,
  checkpoint_version text not null default 'v1',
  model_provider text,
  model_name text,
  model_version text,
  prompt_contract_version text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interaction_sessions_end_after_start
    check (ended_at is null or ended_at >= started_at),
  constraint interaction_sessions_id_user_id_key unique (id, user_id),
  constraint interaction_sessions_state_owner_fkey
    foreign key (personal_state_snapshot_id, user_id)
    references public.personal_state_snapshots(id, user_id)
    on delete set null,
  constraint interaction_sessions_supersedes_owner_fkey
    foreign key (supersedes_id, user_id)
    references public.interaction_sessions(id, user_id)
    on delete set null
);

comment on table public.interaction_sessions is
  'Compact durable resume/checkpoint records for meaningful Me+ interactions. Structured domain records remain authoritative.';

create index if not exists interaction_sessions_user_started_idx
  on public.interaction_sessions (user_id, started_at desc);

create index if not exists interaction_sessions_user_status_started_idx
  on public.interaction_sessions (user_id, status, started_at desc);

create index if not exists interaction_sessions_domains_gin_idx
  on public.interaction_sessions using gin (domains);

create trigger interaction_sessions_set_updated_at
before update on public.interaction_sessions
for each row execute function public.set_updated_at();

alter table public.interaction_sessions enable row level security;

create policy interaction_sessions_select
on public.interaction_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy interaction_sessions_insert
on public.interaction_sessions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy interaction_sessions_update
on public.interaction_sessions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy interaction_sessions_delete
on public.interaction_sessions
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.interaction_sessions from anon;
grant select, insert, update, delete on table public.interaction_sessions to authenticated;
grant all on table public.interaction_sessions to service_role;

create or replace function public.get_resume_context(
  p_domains text[] default null,
  p_limit integer default 3
)
returns setof public.interaction_sessions
language sql
stable
security invoker
set search_path = public
as $$
  select s.*
  from public.interaction_sessions s
  where s.user_id = (select auth.uid())
    and s.status in ('active','closed')
    and (
      p_domains is null
      or cardinality(p_domains) = 0
      or s.domains && p_domains
    )
  order by coalesce(s.ended_at, s.started_at) desc
  limit greatest(1, least(coalesce(p_limit, 3), 10));
$$;

create or replace function public.begin_interaction_session(
  p_interface text default 'chatgpt',
  p_domains text[] default '{}'::text[],
  p_session_type text default null,
  p_external_session_ref text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.interaction_sessions (
    user_id, interface, domains, session_type, external_session_ref, metadata
  )
  values (
    v_user_id,
    coalesce(nullif(p_interface, ''), 'chatgpt'),
    coalesce(p_domains, '{}'::text[]),
    p_session_type,
    p_external_session_ref,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.close_interaction_session(
  p_session_id uuid,
  p_summary text default null,
  p_decisions jsonb default '[]'::jsonb,
  p_new_facts jsonb default '[]'::jsonb,
  p_corrections jsonb default '[]'::jsonb,
  p_open_loops jsonb default '[]'::jsonb,
  p_next_actions jsonb default '[]'::jsonb,
  p_entity_refs jsonb default '[]'::jsonb,
  p_document_refs jsonb default '[]'::jsonb,
  p_source_refs jsonb default '[]'::jsonb,
  p_personal_state_snapshot_id uuid default null,
  p_checkpoint_version text default 'v1',
  p_model_provider text default null,
  p_model_name text default null,
  p_model_version text default null,
  p_prompt_contract_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.interaction_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.interaction_sessions;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.interaction_sessions
  set
    summary = p_summary,
    decisions = coalesce(p_decisions, '[]'::jsonb),
    new_facts = coalesce(p_new_facts, '[]'::jsonb),
    corrections = coalesce(p_corrections, '[]'::jsonb),
    open_loops = coalesce(p_open_loops, '[]'::jsonb),
    next_actions = coalesce(p_next_actions, '[]'::jsonb),
    entity_refs = coalesce(p_entity_refs, '[]'::jsonb),
    document_refs = coalesce(p_document_refs, '[]'::jsonb),
    source_refs = coalesce(p_source_refs, '[]'::jsonb),
    personal_state_snapshot_id = p_personal_state_snapshot_id,
    checkpoint_version = coalesce(nullif(p_checkpoint_version, ''), 'v1'),
    model_provider = p_model_provider,
    model_name = p_model_name,
    model_version = p_model_version,
    prompt_contract_version = p_prompt_contract_version,
    metadata = coalesce(p_metadata, '{}'::jsonb),
    status = 'closed',
    ended_at = now()
  where id = p_session_id
    and user_id = v_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Interaction session not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.get_resume_context(text[], integer) from public, anon;
grant execute on function public.get_resume_context(text[], integer) to authenticated, service_role;

revoke all on function public.begin_interaction_session(text, text[], text, text, jsonb) from public, anon;
grant execute on function public.begin_interaction_session(text, text[], text, text, jsonb) to authenticated, service_role;

revoke all on function public.close_interaction_session(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  uuid, text, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.close_interaction_session(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  uuid, text, text, text, text, text, jsonb
) to authenticated, service_role;
