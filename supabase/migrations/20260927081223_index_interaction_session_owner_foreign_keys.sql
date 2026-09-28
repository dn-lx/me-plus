
create index if not exists interaction_sessions_state_owner_idx
  on public.interaction_sessions (personal_state_snapshot_id, user_id)
  where personal_state_snapshot_id is not null;

create index if not exists interaction_sessions_supersedes_owner_idx
  on public.interaction_sessions (supersedes_id, user_id)
  where supersedes_id is not null;
