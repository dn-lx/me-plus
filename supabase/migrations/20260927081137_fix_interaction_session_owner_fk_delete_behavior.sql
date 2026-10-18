
alter table public.interaction_sessions
  drop constraint if exists interaction_sessions_state_owner_fkey,
  drop constraint if exists interaction_sessions_supersedes_owner_fkey;

alter table public.interaction_sessions
  add constraint interaction_sessions_state_owner_fkey
  foreign key (personal_state_snapshot_id, user_id)
  references public.personal_state_snapshots(id, user_id)
  on delete set null (personal_state_snapshot_id);

alter table public.interaction_sessions
  add constraint interaction_sessions_supersedes_owner_fkey
  foreign key (supersedes_id, user_id)
  references public.interaction_sessions(id, user_id)
  on delete set null (supersedes_id);
