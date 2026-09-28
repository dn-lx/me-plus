
create or replace function public.start_hourly_scheduler_run(
  p_user_id uuid,
  p_automation_id text,
  p_logical_hour timestamptz,
  p_trigger_mode text default 'scheduled'
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_recovery jsonb;
  v_probe jsonb;
  v_policy jsonb;
  v_version text;
  v_run_id uuid;
  v_signal_ids jsonb := '[]'::jsonb;
  v_idempotency_key text;
  v_lease boolean;
begin
  if p_trigger_mode not in ('scheduled','signal','manual','backstop') then
    raise exception 'invalid scheduler trigger mode: %',p_trigger_mode;
  end if;

  perform public.record_scheduler_heartbeat(
    p_user_id,'hourly_task_scheduler','invoked',null,null,60,15,null,p_automation_id
  );

  v_recovery := public.recover_stale_scheduler_runs(
    p_user_id,'hourly_task_scheduler',now()
  );

  v_probe := public.me_scheduler_probe(p_user_id,now());

  if coalesce((v_probe->>'needs_ai')::boolean,false)=false then
    perform public.record_scheduler_heartbeat(
      p_user_id,'hourly_task_scheduler','no_op',null,null,60,15,null,p_automation_id
    );
    return jsonb_build_object(
      'status','no_op',
      'probe',v_probe,
      'recovery',v_recovery
    );
  end if;

  v_policy := public.get_scheduler_policy(p_user_id,'hourly_task_scheduler');

  if v_policy->'global' is null or v_policy->'scheduler' is null then
    perform public.record_scheduler_heartbeat(
      p_user_id,'hourly_task_scheduler','failed',null,
      jsonb_build_object('error_type','missing_scheduler_policy'),60,15,null,p_automation_id
    );
    raise exception 'missing active global/hourly scheduler policy';
  end if;

  if coalesce((v_policy->'global'->>'checksum_valid')::boolean,false)=false
     or coalesce((v_policy->'scheduler'->>'checksum_valid')::boolean,false)=false
     or coalesce((v_policy->'global'->>'policy_schema_version')::integer,0)<>2
     or coalesce((v_policy->'scheduler'->>'policy_schema_version')::integer,0)<>2 then
    perform public.record_scheduler_heartbeat(
      p_user_id,'hourly_task_scheduler','failed',null,
      jsonb_build_object('error_type','scheduler_policy_integrity_failure'),60,15,null,p_automation_id
    );
    raise exception 'scheduler policy integrity/schema validation failed';
  end if;

  v_version := v_policy->'scheduler'->>'policy_version';

  select coalesce(jsonb_agg((x->>'id')::uuid),'[]'::jsonb)
    into v_signal_ids
  from jsonb_array_elements(coalesce(v_probe->'pending_scheduler_signals','[]'::jsonb)) x;

  v_idempotency_key :=
    'hourly_task_scheduler:' ||
    to_char(p_logical_hour at time zone 'Europe/Berlin','YYYY-MM-DD"T"HH24:00') ||
    ':Europe/Berlin:' || v_version;

  v_run_id := public.begin_scheduler_run(
    p_user_id,
    'hourly_task_scheduler',
    'Hourly task scheduler',
    p_trigger_mode,
    v_probe->>'gate_version',
    true,
    v_probe->'reasons',
    v_signal_ids,
    v_version,
    v_idempotency_key
  );

  v_lease := public.try_acquire_scheduler_lease(
    p_user_id,'hourly_task_scheduler',v_run_id,900
  );

  if not v_lease then
    perform public.finish_scheduler_run(
      p_user_id,v_run_id,'no_op',
      '["supabase"]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'type','skipped_overlap',
        'reason','scheduler lease already held'
      )),
      null
    );
    perform public.record_scheduler_heartbeat(
      p_user_id,'hourly_task_scheduler','skipped_overlap',v_version,null,60,15,null,p_automation_id
    );
    return jsonb_build_object(
      'status','skipped_overlap',
      'run_id',v_run_id,
      'probe',v_probe,
      'policy',v_policy,
      'recovery',v_recovery,
      'idempotency_key',v_idempotency_key
    );
  end if;

  perform public.record_scheduler_heartbeat(
    p_user_id,'hourly_task_scheduler','started',v_version,null,60,15,v_run_id,p_automation_id
  );

  return jsonb_build_object(
    'status','started',
    'run_id',v_run_id,
    'probe',v_probe,
    'policy',v_policy,
    'recovery',v_recovery,
    'idempotency_key',v_idempotency_key
  );
end;
$$;

revoke all on function public.start_hourly_scheduler_run(uuid,text,timestamptz,text)
from public,anon,authenticated;
grant execute on function public.start_hourly_scheduler_run(uuid,text,timestamptz,text)
to service_role;
