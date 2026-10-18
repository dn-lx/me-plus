
create table if not exists public.scheduler_dispatches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scheduler_key text not null,
  scheduler_run_id uuid references public.scheduler_run_log(id) on delete set null,
  logical_hour timestamptz not null,
  dispatch_kind text not null,
  status text not null default 'pending'
    check (status in ('pending','claimed','completed','failed','blocked','cancelled')),
  reasons jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scheduler_key, logical_hour, dispatch_kind)
);

create index if not exists scheduler_dispatches_status_available_idx
  on public.scheduler_dispatches(user_id,status,available_at,created_at);

alter table public.scheduler_dispatches enable row level security;
revoke all on table public.scheduler_dispatches from anon, authenticated;
grant select on table public.scheduler_dispatches to authenticated;
grant select,insert,update,delete on table public.scheduler_dispatches to service_role;

drop policy if exists scheduler_dispatches_select_own on public.scheduler_dispatches;
create policy scheduler_dispatches_select_own
on public.scheduler_dispatches
for select
to authenticated
using ((select auth.uid()) = user_id);

comment on table public.scheduler_dispatches is
  'Durable backend scheduler outbox for bounded work that still requires AI reasoning or an external execution adapter.';

create or replace function private.run_meplus_hourly_backend_scheduler(
  p_user_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start jsonb;
  v_status text;
  v_run_id uuid;
  v_probe jsonb;
  v_due jsonb;
  v_one jsonb;
  v_materialized jsonb := '[]'::jsonb;
  v_dispatch_id uuid;
  v_logical_hour timestamptz;
  v_occurrence_date date;
  v_tz text;
  v_policy_version text;
  v_finish jsonb;
  v_error jsonb;
  v_automation_id constant text := 'supabase:pg_cron:meplus-hourly-task-scheduler-backend';
begin
  v_start := public.start_hourly_scheduler_run_with_catalog(
    p_user_id,
    v_automation_id,
    p_now,
    'scheduled'
  );

  v_status := v_start->>'status';

  if v_status is distinct from 'started' then
    return v_start || jsonb_build_object(
      'runtime_host','supabase_pg_cron',
      'backend_function','private.run_meplus_hourly_backend_scheduler'
    );
  end if;

  v_run_id := (v_start->>'run_id')::uuid;
  v_probe := coalesce(v_start->'probe','{}'::jsonb);
  v_logical_hour := (v_start->>'logical_hour')::timestamptz;
  v_tz := coalesce(v_probe->>'timezone','Europe/Berlin');
  v_occurrence_date := (v_logical_hour at time zone v_tz)::date;
  v_policy_version := v_start->'policy'->'scheduler'->>'policy_version';

  begin
    for v_due in
      select value
      from jsonb_array_elements(coalesce(v_probe->'due_routines','[]'::jsonb))
    loop
      v_one := public.scheduler_materialize_routine_action(
        p_user_id,
        (v_due->>'routine_id')::uuid,
        (v_due->>'schedule_id')::uuid,
        v_occurrence_date,
        v_run_id
      );
      v_materialized := v_materialized || jsonb_build_array(v_one);
    end loop;

    insert into public.scheduler_dispatches(
      user_id,scheduler_key,scheduler_run_id,logical_hour,dispatch_kind,status,
      reasons,payload,last_error,updated_at
    )
    values(
      p_user_id,'hourly_task_scheduler',v_run_id,v_logical_hour,
      'reasoning_and_execution_surface','blocked',
      coalesce(v_probe->'reasons','[]'::jsonb),
      jsonb_build_object(
        'policy_version',v_policy_version,
        'materialized_routine_actions',v_materialized,
        'newly_overdue_actions',coalesce(v_probe->'newly_overdue_actions','[]'::jsonb),
        'pending_scheduler_signals',coalesce(v_probe->'pending_scheduler_signals','[]'::jsonb),
        'external_refresh_due',coalesce((v_probe->>'external_refresh_due')::boolean,false),
        'execution_surface','todoist',
        'runtime_host','supabase_pg_cron'
      ),
      jsonb_build_object(
        'error_type','backend_external_executor_not_configured',
        'message','Canonical backend scheduling completed; AI/Todoist execution is durably queued until a server-side executor credential/path is configured.'
      ),
      clock_timestamp()
    )
    on conflict (user_id,scheduler_key,logical_hour,dispatch_kind)
    do update set
      scheduler_run_id=excluded.scheduler_run_id,
      reasons=excluded.reasons,
      payload=excluded.payload,
      last_error=excluded.last_error,
      updated_at=clock_timestamp()
    returning id into v_dispatch_id;

    perform public.record_scheduler_heartbeat(
      p_user_id,'todoist_execution_dispatcher','failed',v_policy_version,
      jsonb_build_object(
        'error_type','backend_external_executor_not_configured',
        'dispatch_id',v_dispatch_id,
        'message','Backend clock/gate is active; external Todoist executor still requires a server-side integration credential/path.'
      ),
      null,null,null,'supabase:backend-dispatch'
    );
  exception when others then
    v_error := jsonb_build_object(
      'error_type','backend_scheduler_execution_exception',
      'sqlstate',sqlstate,
      'message',sqlerrm
    );
    v_finish := public.finish_hourly_scheduler_run(
      p_user_id,v_run_id,'failed',
      jsonb_build_array('supabase_backend'),
      jsonb_build_object('materialized_routine_actions',v_materialized),
      v_error,v_policy_version,v_automation_id
    );
    return jsonb_build_object(
      'status','failed','run_id',v_run_id,'error',v_error,'finish',v_finish
    );
  end;

  v_finish := public.finish_hourly_scheduler_run(
    p_user_id,v_run_id,'completed',
    jsonb_build_array('supabase_backend'),
    jsonb_build_object(
      'runtime_host','supabase_pg_cron',
      'materialized_routine_count',jsonb_array_length(v_materialized),
      'materialized_routine_actions',v_materialized,
      'dispatch_id',v_dispatch_id,
      'external_execution_status','blocked_pending_backend_adapter'
    ),
    null,v_policy_version,v_automation_id
  );

  return jsonb_build_object(
    'status','completed',
    'runtime_host','supabase_pg_cron',
    'run_id',v_run_id,
    'logical_hour',v_logical_hour,
    'materialized_routine_count',jsonb_array_length(v_materialized),
    'dispatch_id',v_dispatch_id,
    'external_execution_status','blocked_pending_backend_adapter',
    'finish',v_finish
  );
end;
$function$;

revoke all on function private.run_meplus_hourly_backend_scheduler(uuid,timestamptz)
  from public, anon, authenticated;

create or replace function private.run_meplus_scheduler_watchdog(
  p_user_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_failures jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_hb public.scheduler_heartbeats%rowtype;
  v_hourly_active boolean := false;
  v_watchdog_active boolean := false;
  v_latest_cron_status text;
  v_latest_cron_end timestamptz;
  v_blocked_dispatches integer := 0;
  v_error jsonb;
  v_policy jsonb;
  v_policy_version text;
begin
  perform public.record_scheduler_heartbeat(
    p_user_id,'scheduler_failure_escalation','invoked',null,null,60,20,null,
    'supabase:pg_cron:meplus-scheduler-watchdog-backend'
  );

  v_policy := public.get_scheduler_policy(p_user_id,'scheduler_failure_escalation');
  v_policy_version := v_policy->'scheduler'->>'policy_version';

  if v_policy->'global' is null
     or v_policy->'scheduler' is null
     or coalesce((v_policy->'global'->>'checksum_valid')::boolean,false)=false
     or coalesce((v_policy->'scheduler'->>'checksum_valid')::boolean,false)=false
     or coalesce((v_policy->'global'->>'policy_schema_version')::integer,0)<>2
     or coalesce((v_policy->'scheduler'->>'policy_schema_version')::integer,0)<>2 then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'error_type','watchdog_policy_invalid'
    ));
  end if;

  select coalesce(bool_or(active),false) into v_hourly_active
  from cron.job where jobname='meplus-hourly-task-scheduler-backend';

  select coalesce(bool_or(active),false) into v_watchdog_active
  from cron.job where jobname='meplus-scheduler-watchdog-backend';

  if not v_hourly_active then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'error_type','hourly_backend_cron_inactive'
    ));
  end if;

  if not v_watchdog_active then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'error_type','watchdog_backend_cron_inactive'
    ));
  end if;

  select * into v_hb
  from public.scheduler_heartbeats
  where user_id=p_user_id and scheduler_key='hourly_task_scheduler';

  if not found then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'error_type','hourly_heartbeat_missing'
    ));
  else
    if v_hb.last_invoked_at is null
       or p_now > v_hb.last_invoked_at + interval '75 minutes' then
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'error_type','hourly_backend_materially_late',
        'last_invoked_at',v_hb.last_invoked_at
      ));
    end if;
    if v_hb.last_status='failed' then
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'error_type','hourly_backend_last_status_failed',
        'last_failed_at',v_hb.last_failed_at,
        'last_error',v_hb.last_error
      ));
    end if;
  end if;

  select d.status,d.end_time
  into v_latest_cron_status,v_latest_cron_end
  from cron.job_run_details d
  join cron.job j on j.jobid=d.jobid
  where j.jobname='meplus-hourly-task-scheduler-backend'
  order by d.runid desc
  limit 1;

  if v_latest_cron_status is not null
     and v_latest_cron_status not in ('succeeded','running') then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'error_type','hourly_backend_cron_last_run_failed',
      'cron_status',v_latest_cron_status,
      'cron_end_time',v_latest_cron_end
    ));
  end if;

  select count(*) into v_blocked_dispatches
  from public.scheduler_dispatches
  where user_id=p_user_id
    and scheduler_key='hourly_task_scheduler'
    and status='blocked';

  if v_blocked_dispatches>0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'warning_type','external_dispatch_blocked',
      'blocked_dispatch_count',v_blocked_dispatches,
      'reason','Backend AI/Todoist executor is not configured yet.'
    ));
  end if;

  if jsonb_array_length(v_failures)>0 then
    v_error := jsonb_build_object(
      'error_type','backend_scheduler_health_failure',
      'failures',v_failures,
      'warnings',v_warnings
    );
    perform public.record_scheduler_heartbeat(
      p_user_id,'scheduler_failure_escalation','failed',v_policy_version,
      v_error,60,20,null,'supabase:pg_cron:meplus-scheduler-watchdog-backend'
    );
    perform public.record_scheduler_signal(
      p_user_id,'backend_scheduler_health_failure','scheduler_heartbeats',null,
      v_error,
      'backend_scheduler_health_failure:' ||
      to_char(p_now at time zone 'Europe/Berlin','YYYY-MM-DD"T"HH24')
    );
    return jsonb_build_object('status','failed','failures',v_failures,'warnings',v_warnings);
  end if;

  perform public.record_scheduler_heartbeat(
    p_user_id,'scheduler_failure_escalation','completed',v_policy_version,
    null,60,20,null,'supabase:pg_cron:meplus-scheduler-watchdog-backend'
  );

  return jsonb_build_object(
    'status','completed',
    'failures',v_failures,
    'warnings',v_warnings,
    'hourly_cron_active',v_hourly_active,
    'watchdog_cron_active',v_watchdog_active
  );
end;
$function$;

revoke all on function private.run_meplus_scheduler_watchdog(uuid,timestamptz)
  from public, anon, authenticated;

do $policy$
declare v_old public.scheduler_policies%rowtype; v_new jsonb;
begin
  select * into v_old from public.scheduler_policies
  where user_id='459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid
    and policy_key='global' and status='active'
  order by effective_from desc limit 1 for update;
  if not found then raise exception 'active global scheduler policy missing'; end if;
  update public.scheduler_policies set status='retired',updated_at=clock_timestamp() where id=v_old.id;
  v_new := v_old.policy || jsonb_build_object(
    'scheduler_runtime',jsonb_build_object(
      'authoritative_clock_substrate','supabase_pg_cron',
      'authoritative_watchdog_substrate','supabase_pg_cron',
      'chatgpt_scheduled_tasks_authoritative',false,
      'external_execution_bridge','durable_scheduler_dispatches_until_backend_adapters_configured'
    )
  );
  insert into public.scheduler_policies(
    user_id,policy_key,policy_version,status,source_document_id,source_document_title,
    effective_from,policy,supersedes_id,policy_schema_version,policy_checksum
  ) values(
    v_old.user_id,v_old.policy_key,'1.14-draft','active',v_old.source_document_id,v_old.source_document_title,
    clock_timestamp(),v_new,v_old.id,2,md5(v_new::text)
  );
end;
$policy$;

do $policy$
declare v_old public.scheduler_policies%rowtype; v_new jsonb;
begin
  select * into v_old from public.scheduler_policies
  where user_id='459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid
    and policy_key='hourly_task_scheduler' and status='active'
  order by effective_from desc limit 1 for update;
  if not found then raise exception 'active hourly scheduler policy missing'; end if;
  update public.scheduler_policies set status='retired',updated_at=clock_timestamp() where id=v_old.id;
  v_new := v_old.policy || jsonb_build_object(
    'runtime_host','supabase_pg_cron',
    'backend_function','private.run_meplus_hourly_backend_scheduler',
    'cron_job','meplus-hourly-task-scheduler-backend',
    'chatgpt_scheduled_task_authoritative',false,
    'external_dispatch',jsonb_build_object(
      'table','scheduler_dispatches',
      'kind','reasoning_and_execution_surface',
      'todoist_backend_status','blocked_until_server_side_adapter_configured',
      'canonical_materialization_continues_without_external_surface',true
    )
  );
  insert into public.scheduler_policies(
    user_id,policy_key,policy_version,status,source_document_id,source_document_title,
    effective_from,policy,supersedes_id,policy_schema_version,policy_checksum
  ) values(
    v_old.user_id,v_old.policy_key,'1.14-draft','active',v_old.source_document_id,v_old.source_document_title,
    clock_timestamp(),v_new,v_old.id,2,md5(v_new::text)
  );
end;
$policy$;

do $policy$
declare v_old public.scheduler_policies%rowtype; v_new jsonb;
begin
  select * into v_old from public.scheduler_policies
  where user_id='459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid
    and policy_key='scheduler_failure_escalation' and status='active'
  order by effective_from desc limit 1 for update;
  if not found then raise exception 'active watchdog policy missing'; end if;
  update public.scheduler_policies set status='retired',updated_at=clock_timestamp() where id=v_old.id;
  v_new := v_old.policy || jsonb_build_object(
    'runtime_host','supabase_pg_cron',
    'backend_function','private.run_meplus_scheduler_watchdog',
    'cron_job','meplus-scheduler-watchdog-backend',
    'independent_from_chatgpt_scheduled_tasks',true,
    'health_sources',jsonb_build_array(
      'scheduler_heartbeats','scheduler_run_log','cron.job','cron.job_run_details','scheduler_dispatches'
    )
  );
  insert into public.scheduler_policies(
    user_id,policy_key,policy_version,status,source_document_id,source_document_title,
    effective_from,policy,supersedes_id,policy_schema_version,policy_checksum
  ) values(
    v_old.user_id,v_old.policy_key,'1.14-draft','active',v_old.source_document_id,v_old.source_document_title,
    clock_timestamp(),v_new,v_old.id,2,md5(v_new::text)
  );
end;
$policy$;

do $cron$
declare r record;
begin
  for r in select jobid from cron.job
           where jobname in ('meplus-hourly-task-scheduler-backend','meplus-scheduler-watchdog-backend')
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$cron$;

select cron.schedule(
  'meplus-hourly-task-scheduler-backend','0 * * * *',
  $croncmd$select private.run_meplus_hourly_backend_scheduler('459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid, clock_timestamp());$croncmd$
);

select cron.schedule(
  'meplus-scheduler-watchdog-backend','15 * * * *',
  $croncmd$select private.run_meplus_scheduler_watchdog('459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid, clock_timestamp());$croncmd$
);
