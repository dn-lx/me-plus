
create table if not exists public.todoist_catalog_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('routine','action')),
  entity_id uuid not null,
  todoist_project_id text not null,
  todoist_section_id text not null,
  todoist_task_id text not null,
  last_synced_title text not null,
  catalog_status text not null default 'active'
    check (catalog_status in ('active','deleted','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id,entity_type,entity_id),
  unique(user_id,todoist_task_id)
);

alter table public.todoist_catalog_items enable row level security;

drop policy if exists todoist_catalog_items_select_own on public.todoist_catalog_items;
create policy todoist_catalog_items_select_own
on public.todoist_catalog_items for select to authenticated
using ((select auth.uid())=user_id);

revoke all on public.todoist_catalog_items from anon,authenticated;
grant select on public.todoist_catalog_items to authenticated;
grant all on public.todoist_catalog_items to service_role;

create index if not exists todoist_catalog_items_user_status_idx
  on public.todoist_catalog_items(user_id,catalog_status,entity_type);

comment on table public.todoist_catalog_items is
'Identity/provenance mapping for the Me+ Catalog Todoist configuration surface. Catalog completion has no canonical effect; deletion deactivates/cancels the mapped canonical entity.';
