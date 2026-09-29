create or replace function public.scheduler_mark_expired_routine_surfaces_unsurfaced(
  p_user_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids jsonb := '[]'::jsonb;
begin
  with targets as (
    select a.id
    from public.actions a
    where a.user_id = p_user_id
      and a.origin = 'routine'
      and a.status in ('planned','in_progress')
      and a.due_at is not null
      and a.due_at <= p_now
      and coalesce(a.constraint_flags->>'surface_state','') = 'surfaced'
      and nullif(a.constraint_flags->>'todoist_task_id','') is not null
    for update
  ), updated as (
    update public.actions a
    set constraint_flags = a.constraint_flags || jsonb_build_object(
          'surface_state','unsurfaced',
          'unsurface_reason','expired_routine_window',
          'unsurface_requested_at',p_now
        ),
        updated_at = clock_timestamp()
    from targets t
    where a.id = t.id
    returning a.id
  )
  select coalesce(jsonb_agg(id::text),'[]'::jsonb)
  into v_ids
  from updated;

  return v_ids;
end;
$$;

revoke all on function public.scheduler_mark_expired_routine_surfaces_unsurfaced(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.scheduler_mark_expired_routine_surfaces_unsurfaced(uuid,timestamptz) to service_role;
