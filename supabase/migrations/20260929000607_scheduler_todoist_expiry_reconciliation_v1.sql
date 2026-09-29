create or replace function public.claim_todoist_scheduler_dispatch()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
  v_expired_user uuid;
  v_expired_ids jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
begin
  select a.user_id
  into v_expired_user
  from public.actions a
  where a.origin='routine'
    and a.status in ('planned','in_progress')
    and a.due_at is not null
    and a.due_at <= v_now
    and coalesce(a.constraint_flags->>'surface_state','')='surfaced'
    and nullif(a.constraint_flags->>'todoist_task_id','') is not null
  order by a.due_at,a.created_at
  limit 1;

  if v_expired_user is not null then
    v_expired_ids := public.scheduler_mark_expired_routine_surfaces_unsurfaced(v_expired_user,v_now);

    if jsonb_array_length(v_expired_ids) > 0 then
      insert into public.scheduler_dispatches(
        user_id,scheduler_key,scheduler_run_id,logical_hour,dispatch_kind,status,
        reasons,payload,completed_at,updated_at
      ) values (
        v_expired_user,
        'todoist_window_reconciler',
        null,
        date_trunc('minute',v_now),
        'reasoning_and_execution_surface',
        'completed',
        jsonb_build_array('expired_todoist_routine_window'),
        jsonb_build_object(
          'todoist_action_ids',v_expired_ids,
          'execution_surface','todoist',
          'source','todoist_window_reconciler'
        ),
        v_now,
        v_now
      )
      on conflict (user_id,scheduler_key,logical_hour,dispatch_kind)
      do update set
        reasons=excluded.reasons,
        payload=excluded.payload,
        status='completed',
        completed_at=v_now,
        external_status='pending',
        external_available_at=v_now,
        external_claimed_at=null,
        external_completed_at=null,
        external_last_error=null,
        updated_at=v_now;
    end if;
  end if;

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
  order by d.logical_hour,d.created_at
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
