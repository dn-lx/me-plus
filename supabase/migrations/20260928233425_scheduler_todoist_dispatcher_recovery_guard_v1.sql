-- A wake should not leave a dispatch stuck in processing forever. The claim function
-- already allows stale claims, but this helper makes the intended retry semantics explicit.
create or replace function public.recover_stale_todoist_dispatches()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.scheduler_dispatches
  set external_status='retry',
      external_available_at=now(),
      external_claimed_at=null,
      external_last_error=coalesce(external_last_error,'{}'::jsonb) || jsonb_build_object(
        'error_type','stale_external_claim_recovered',
        'message','Todoist dispatcher claim exceeded 10 minutes and was returned to retry.'
      ),
      updated_at=now()
  where external_status='processing'
    and external_claimed_at < now()-interval '10 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.recover_stale_todoist_dispatches() from public,anon,authenticated;
grant execute on function public.recover_stale_todoist_dispatches() to service_role;
