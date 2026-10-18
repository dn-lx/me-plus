alter table public.hydration_events add column if not exists action_id uuid references public.actions(id) on delete set null;
create unique index if not exists hydration_events_user_action_unique on public.hydration_events(user_id, action_id) where action_id is not null;
create index if not exists hydration_events_user_observed_idx on public.hydration_events(user_id, observed_at desc);
