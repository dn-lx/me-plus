
alter table public.todoist_catalog_items
  add column if not exists previous_todoist_task_ids jsonb not null default '[]'::jsonb;

create or replace function public.catalog_replace_surface_task(
  p_user_id uuid,
  p_old_todoist_task_id text,
  p_new_todoist_task_id text,
  p_new_section_id text,
  p_title text
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_map public.todoist_catalog_items%rowtype;
begin
  select * into v_map
  from public.todoist_catalog_items
  where user_id=p_user_id
    and todoist_task_id=p_old_todoist_task_id
    and catalog_status='active'
  for update;

  if not found then
    raise exception 'unknown active catalog item %',p_old_todoist_task_id;
  end if;

  update public.todoist_catalog_items
  set previous_todoist_task_ids =
        previous_todoist_task_ids || jsonb_build_array(p_old_todoist_task_id),
      todoist_task_id=p_new_todoist_task_id,
      todoist_section_id=coalesce(p_new_section_id,todoist_section_id),
      last_synced_title=coalesce(nullif(btrim(p_title),''),last_synced_title),
      updated_at=now()
  where id=v_map.id;

  return jsonb_build_object(
    'status','replaced_surface_task',
    'entity_type',v_map.entity_type,
    'entity_id',v_map.entity_id,
    'old_todoist_task_id',p_old_todoist_task_id,
    'new_todoist_task_id',p_new_todoist_task_id
  );
end;
$$;

revoke all on function public.catalog_replace_surface_task(uuid,text,text,text,text)
from public,anon,authenticated;
grant execute on function public.catalog_replace_surface_task(uuid,text,text,text,text)
to service_role;
