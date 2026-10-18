
create or replace function public.recover_stale_scheduler_runs(
  p_user_id uuid,
  p_scheduler_key text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_count integer := 0;
begin
  select array_agg(r.id)
  into v_ids
  from public.scheduler_run_log r
  where r.user_id=p_user_id
    and r.scheduler_key=p_scheduler_key
    and r.status='started'
    and r.triggered_at < p_now - interval '20 minutes'
    and not exists (
      select 1
      from public.scheduler_leases l
      where l.user_id=p_user_id
        and l.scheduler_key=p_scheduler_key
        and l.run_id=r.id
        and l.lease_until > p_now
    );

  if v_ids is not null then
    update public.scheduler_run_log
    set status='failed',
        finished_at=p_now,
        error=jsonb_build_object(
          'error_type','stale_started_run',
          'message','Run remained started beyond the recovery threshold without a live lease.',
          'recovered_at',p_now
        )
    where id=any(v_ids);

    get diagnostics v_count = row_count;
  end if;

  delete from public.scheduler_leases
  where user_id=p_user_id
    and scheduler_key=p_scheduler_key
    and lease_until <= p_now;

  return jsonb_build_object(
    'scheduler_key',p_scheduler_key,
    'recovered_count',v_count,
    'recovered_run_ids',coalesce(to_jsonb(v_ids),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.recover_stale_scheduler_runs(uuid,text,timestamptz)
from public,anon,authenticated;
grant execute on function public.recover_stale_scheduler_runs(uuid,text,timestamptz)
to service_role;

comment on function public.recover_stale_scheduler_runs(uuid,text,timestamptz) is
'Marks abandoned started scheduler runs failed when no live lease remains, and clears expired leases.';
