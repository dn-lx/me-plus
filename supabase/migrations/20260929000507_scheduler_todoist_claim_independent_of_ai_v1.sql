create or replace function public.claim_todoist_scheduler_dispatch()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
begin
  select d.* into v_dispatch
  from public.scheduler_dispatches d
  where d.dispatch_kind='reasoning_and_execution_surface'
    and (
      d.status='completed'
      or (
        d.status in ('pending','claimed','blocked','failed')
        and (
          coalesce(jsonb_array_length(coalesce(d.payload->'materialized_routine_actions','[]'::jsonb)),0) > 0
          or coalesce(jsonb_array_length(coalesce(d.payload->'todoist_action_ids','[]'::jsonb)),0) > 0
        )
      )
    )
    and d.external_status in ('pending','retry')
    and d.external_available_at <= now()
    and (d.external_claimed_at is null or d.external_claimed_at < now() - interval '10 minutes')
  order by d.logical_hour, d.created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.scheduler_dispatches
  set external_status='processing',
      external_attempts=external_attempts+1,
      external_claimed_at=now(),
      external_last_error=null,
      updated_at=now()
  where id=v_dispatch.id
  returning * into v_dispatch;

  return to_jsonb(v_dispatch);
end;
$$;
