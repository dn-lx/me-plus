
create or replace function public.finish_hourly_scheduler_run(
  p_user_id uuid,
  p_run_id uuid,
  p_status text,
  p_sources_checked jsonb,
  p_changes_made jsonb,
  p_error jsonb,
  p_policy_version text,
  p_automation_id text
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_finish boolean;
  v_release boolean;
  v_hb jsonb;
begin
  if p_status not in ('completed','failed','no_op') then
    raise exception 'invalid terminal hourly scheduler status: %',p_status;
  end if;

  v_finish := public.finish_scheduler_run(
    p_user_id,p_run_id,p_status,p_sources_checked,p_changes_made,p_error
  );

  v_release := public.release_scheduler_lease(
    p_user_id,'hourly_task_scheduler',p_run_id
  );

  v_hb := public.record_scheduler_heartbeat(
    p_user_id,
    'hourly_task_scheduler',
    case when p_status='completed' then 'completed'
         when p_status='failed' then 'failed'
         else 'no_op' end,
    p_policy_version,
    p_error,
    60,15,null,p_automation_id
  );

  return jsonb_build_object(
    'run_finished',v_finish,
    'lease_released',v_release,
    'heartbeat',v_hb
  );
end;
$$;

revoke all on function public.finish_hourly_scheduler_run(uuid,uuid,text,jsonb,jsonb,jsonb,text,text)
from public,anon,authenticated;
grant execute on function public.finish_hourly_scheduler_run(uuid,uuid,text,jsonb,jsonb,jsonb,text,text)
to service_role;
