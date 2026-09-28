create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dispatch_id uuid references public.scheduler_dispatches(id) on delete set null,
  provider text not null,
  model text not null,
  model_version text,
  response_id text,
  request_started_at timestamptz not null,
  completed_at timestamptz not null,
  status text not null check (status in ('completed','failed')),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  input_rate_per_million numeric(12,6),
  cached_input_rate_per_million numeric(12,6),
  cache_write_rate_per_million numeric(12,6),
  output_rate_per_million numeric(12,6),
  regional_multiplier numeric(8,4) not null default 1,
  estimated_cost_usd numeric(18,8),
  usage jsonb not null default '{}'::jsonb,
  pricing_source text,
  error jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_completed_idx
  on public.ai_usage_events(user_id, completed_at desc);
create index if not exists ai_usage_events_dispatch_idx
  on public.ai_usage_events(dispatch_id, created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists ai_usage_events_owner_select on public.ai_usage_events;
create policy ai_usage_events_owner_select
  on public.ai_usage_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.ai_usage_events to authenticated;
revoke insert, update, delete on public.ai_usage_events from anon, authenticated;

create or replace function public.claim_ai_scheduler_dispatch()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
begin
  select d.* into v_dispatch
  from public.scheduler_dispatches d
  where d.dispatch_kind = 'reasoning_and_execution_surface'
    and d.available_at <= clock_timestamp()
    and d.attempts < 3
    and (
      d.status = 'pending'
      or (
        d.status = 'blocked'
        and coalesce(d.last_error->>'error_type','') = 'backend_external_executor_not_configured'
      )
      or (
        d.status = 'claimed'
        and d.claimed_at < clock_timestamp() - interval '10 minutes'
      )
    )
  order by d.available_at, d.created_at
  for update skip locked
  limit 1;

  if not found then return null; end if;

  update public.scheduler_dispatches
  set status = 'claimed', attempts = attempts + 1, claimed_at = clock_timestamp(),
      completed_at = null, last_error = null, updated_at = clock_timestamp()
  where id = v_dispatch.id
  returning * into v_dispatch;

  perform public.record_scheduler_heartbeat(
    v_dispatch.user_id,'ai_reasoning_worker','invoked',
    coalesce(v_dispatch.payload->>'policy_version','1.14-draft'),
    null,5,10,v_dispatch.scheduler_run_id,'supabase:edge:me-plus-reasoning-worker'
  );

  return jsonb_build_object(
    'id',v_dispatch.id,'user_id',v_dispatch.user_id,'scheduler_key',v_dispatch.scheduler_key,
    'scheduler_run_id',v_dispatch.scheduler_run_id,'logical_hour',v_dispatch.logical_hour,
    'dispatch_kind',v_dispatch.dispatch_kind,'reasons',coalesce(v_dispatch.reasons,'[]'::jsonb),
    'payload',coalesce(v_dispatch.payload,'{}'::jsonb),'attempts',v_dispatch.attempts
  );
end;
$$;

revoke all on function public.claim_ai_scheduler_dispatch() from public, anon, authenticated;
grant execute on function public.claim_ai_scheduler_dispatch() to service_role;

create or replace function public.reschedule_ai_scheduler_dispatch(
  p_dispatch_id uuid,
  p_error jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
  v_next_status text;
  v_available_at timestamptz;
begin
  select * into v_dispatch from public.scheduler_dispatches where id=p_dispatch_id for update;
  if not found then raise exception 'scheduler dispatch not found'; end if;
  if v_dispatch.status <> 'claimed' then
    return jsonb_build_object('status',v_dispatch.status,'dispatch_id',v_dispatch.id,'ignored',true);
  end if;

  if v_dispatch.attempts >= 3 then
    v_next_status := 'failed';
    v_available_at := v_dispatch.available_at;
  else
    v_next_status := 'pending';
    v_available_at := clock_timestamp() + make_interval(mins => greatest(2, least(15, v_dispatch.attempts * 3)));
  end if;

  update public.scheduler_dispatches
  set status=v_next_status, available_at=v_available_at, claimed_at=null,
      completed_at=case when v_next_status='failed' then clock_timestamp() else null end,
      last_error=coalesce(p_error,'{}'::jsonb), updated_at=clock_timestamp()
  where id=v_dispatch.id;

  perform public.record_scheduler_heartbeat(
    v_dispatch.user_id,'ai_reasoning_worker','failed',
    coalesce(v_dispatch.payload->>'policy_version','1.14-draft'),coalesce(p_error,'{}'::jsonb),
    5,10,null,'supabase:edge:me-plus-reasoning-worker'
  );

  return jsonb_build_object('dispatch_id',v_dispatch.id,'status',v_next_status,'attempts',v_dispatch.attempts,'available_at',v_available_at);
end;
$$;

revoke all on function public.reschedule_ai_scheduler_dispatch(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reschedule_ai_scheduler_dispatch(uuid,jsonb) to service_role;

create or replace function public.complete_ai_scheduler_dispatch(
  p_dispatch_id uuid,
  p_decision jsonb,
  p_provider text,
  p_model text,
  p_model_version text,
  p_prompt_contract_version text,
  p_response_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch public.scheduler_dispatches%rowtype;
  v_state jsonb;
  v_snapshot_id uuid;
  v_rec jsonb;
  v_rec_id uuid;
  v_action_id uuid;
  v_recommendation_ids jsonb := '[]'::jsonb;
  v_action_ids jsonb := '[]'::jsonb;
  v_rec_count integer := 0;
  v_title text;
  v_domain text;
  v_rationale text;
  v_confidence text;
  v_priority integer;
  v_action_priority text;
  v_version text;
  v_estimated_minutes integer;
  v_create_action boolean;
  v_risk_class text;
  v_policy_version text;
begin
  select * into v_dispatch from public.scheduler_dispatches where id=p_dispatch_id for update;
  if not found then raise exception 'scheduler dispatch not found'; end if;
  if v_dispatch.status <> 'claimed' then raise exception 'scheduler dispatch is not claimed'; end if;
  if coalesce(p_decision->>'decision','') not in ('noop','recommend') then raise exception 'invalid AI decision'; end if;
  if jsonb_typeof(coalesce(p_decision->'recommendations','[]'::jsonb)) <> 'array' then raise exception 'recommendations must be an array'; end if;
  if jsonb_array_length(coalesce(p_decision->'recommendations','[]'::jsonb)) > 3 then raise exception 'too many recommendations'; end if;

  v_policy_version := coalesce(v_dispatch.payload->>'policy_version','1.14-draft');
  v_state := public.build_personal_state(v_dispatch.user_id, clock_timestamp());

  insert into public.personal_state_snapshots(user_id,state_type,as_of,schema_version,state,input_refs,builder_version)
  values (
    v_dispatch.user_id,'scheduler_reasoning',clock_timestamp(),coalesce(v_state->>'schema_version','v1'),v_state,
    jsonb_build_array(jsonb_build_object('type','scheduler_dispatch','id',v_dispatch.id)),'ai-orchestrator-v1'
  ) returning id into v_snapshot_id;

  if p_decision->>'decision'='recommend' then
    for v_rec in select value from jsonb_array_elements(coalesce(p_decision->'recommendations','[]'::jsonb))
    loop
      v_rec_count := v_rec_count + 1;
      if v_rec_count > 3 then raise exception 'recommendation limit exceeded'; end if;
      v_title := left(btrim(coalesce(v_rec->>'title','')),180);
      v_domain := left(btrim(coalesce(v_rec->>'domain','general')),80);
      v_rationale := left(btrim(coalesce(v_rec->>'rationale','')),900);
      v_confidence := coalesce(v_rec->>'confidence','insufficient_data');
      if v_confidence not in ('high','medium','experimental','insufficient_data') then v_confidence := 'insufficient_data'; end if;
      v_priority := greatest(1,least(5,coalesce((v_rec->>'priority')::integer,3)));
      v_action_priority := coalesce(v_rec->>'action_priority','should');
      if v_action_priority not in ('must','should','bonus') then v_action_priority := 'should'; end if;
      v_version := coalesce(v_rec->>'version','full');
      if v_version not in ('full','reduced','minimum') then v_version := 'full'; end if;
      v_estimated_minutes := greatest(1,least(120,coalesce((v_rec->>'estimated_minutes')::integer,15)));
      v_create_action := coalesce((v_rec->>'create_action')::boolean,false);
      v_risk_class := coalesce(v_rec->>'risk_class','needs_user');
      if v_title='' or v_rationale='' then continue; end if;
      if v_risk_class <> 'low' then v_create_action := false; end if;

      insert into public.recommendations(
        user_id,personal_state_snapshot_id,recommendation_type,domain,generated_at,expires_at,title,rationale,
        confidence,priority,proposed_action,evidence,constraints_considered,policy_version,model_provider,
        model_name,model_version,prompt_contract_version
      ) values (
        v_dispatch.user_id,v_snapshot_id,'scheduler_reasoning',v_domain,clock_timestamp(),clock_timestamp()+interval '24 hours',
        v_title,v_rationale,v_confidence,v_priority,v_rec,
        jsonb_build_array(jsonb_build_object('type','scheduler_dispatch','id',v_dispatch.id,'logical_hour',v_dispatch.logical_hour,'reasons',coalesce(v_dispatch.reasons,'[]'::jsonb),'response_id',p_response_id)),
        coalesce(v_rec->'constraints_considered','[]'::jsonb),v_policy_version,p_provider,p_model,p_model_version,p_prompt_contract_version
      ) returning id into v_rec_id;
      v_recommendation_ids := v_recommendation_ids || jsonb_build_array(v_rec_id);

      if v_create_action and not exists (
        select 1 from public.actions a
        where a.user_id=v_dispatch.user_id and lower(a.domain)=lower(v_domain)
          and lower(btrim(a.title))=lower(v_title)
          and a.status in ('proposed','planned','available','in_progress','partial')
      ) then
        insert into public.actions(
          user_id,recommendation_id,domain,origin,title,instructions,priority,version,status,
          estimated_minutes,available_from,reason,constraint_flags
        ) values (
          v_dispatch.user_id,v_rec_id,v_domain,'ai_scheduler_v1',v_title,
          nullif(left(btrim(coalesce(v_rec->>'instructions','')),1200),''),v_action_priority,v_version,'proposed',
          v_estimated_minutes,clock_timestamp(),v_rationale,
          jsonb_build_object('source','ai_reasoning_worker','dispatch_id',v_dispatch.id,'risk_class',v_risk_class,
            'minimum_action',left(coalesce(v_rec->>'minimum_action',''),500),'requires_user_approval',true,'external_execution',false)
        ) returning id into v_action_id;
        v_action_ids := v_action_ids || jsonb_build_array(v_action_id);
      end if;
    end loop;
  end if;

  update public.scheduler_dispatches
  set status='completed', completed_at=clock_timestamp(), claimed_at=null, last_error=null,
      payload=coalesce(payload,'{}'::jsonb) || jsonb_build_object(
        'ai_reasoning',jsonb_build_object(
          'decision',p_decision->>'decision','summary',left(coalesce(p_decision->>'summary',''),800),
          'provider',p_provider,'model',p_model,'model_version',p_model_version,
          'prompt_contract_version',p_prompt_contract_version,'response_id',p_response_id,
          'personal_state_snapshot_id',v_snapshot_id,'recommendation_ids',v_recommendation_ids,
          'action_ids',v_action_ids,'completed_at',clock_timestamp()
        ),
        'external_execution_status',case when jsonb_array_length(v_action_ids)>0 then 'blocked_pending_todoist_adapter' else 'not_required' end
      ),
      updated_at=clock_timestamp()
  where id=v_dispatch.id;

  perform public.record_scheduler_heartbeat(v_dispatch.user_id,'ai_reasoning_worker','completed',v_policy_version,null,5,10,null,'supabase:edge:me-plus-reasoning-worker');
  if jsonb_array_length(v_action_ids)>0 then
    perform public.record_scheduler_heartbeat(
      v_dispatch.user_id,'todoist_execution_dispatcher','failed',v_policy_version,
      jsonb_build_object('error_type','backend_todoist_executor_not_configured','dispatch_id',v_dispatch.id,'action_ids',v_action_ids,
        'message','AI reasoning completed and proposed actions are durable; Todoist backend adapter is not configured.'),
      null,null,null,'supabase:backend-dispatch'
    );
  end if;

  return jsonb_build_object('dispatch_id',v_dispatch.id,'status','completed','decision',p_decision->>'decision',
    'personal_state_snapshot_id',v_snapshot_id,'recommendation_ids',v_recommendation_ids,'action_ids',v_action_ids);
end;
$$;

revoke all on function public.complete_ai_scheduler_dispatch(uuid,jsonb,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_ai_scheduler_dispatch(uuid,jsonb,text,text,text,text,text) to service_role;

create or replace function private.wake_meplus_reasoning_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_publishable_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='meplus_project_url' order by created_at desc limit 1;
  select decrypted_secret into v_publishable_key from vault.decrypted_secrets where name='meplus_worker_publishable_key' order by created_at desc limit 1;
  if v_url is null or v_publishable_key is null then raise exception 'Me+ reasoning worker wake configuration is missing from Vault'; end if;
  select net.http_post(
    url:=rtrim(v_url,'/') || '/functions/v1/me-plus-reasoning-worker',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',v_publishable_key),
    body:=jsonb_build_object('source','supabase_scheduler','requested_at',clock_timestamp()),
    timeout_milliseconds:=5000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function private.wake_meplus_reasoning_worker() from public, anon, authenticated;
grant execute on function private.wake_meplus_reasoning_worker() to service_role;

create or replace function private.run_meplus_hourly_backend_scheduler(
  p_user_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start jsonb;
  v_status text;
  v_run_id uuid;
  v_probe jsonb;
  v_due jsonb;
  v_one jsonb;
  v_materialized jsonb := '[]'::jsonb;
  v_dispatch_id uuid;
  v_wake_request_id bigint;
  v_logical_hour timestamptz;
  v_occurrence_date date;
  v_tz text;
  v_policy_version text;
  v_finish jsonb;
  v_error jsonb;
  v_automation_id constant text := 'supabase:pg_cron:meplus-hourly-task-scheduler-backend';
begin
  v_start := public.start_hourly_scheduler_run_with_catalog(p_user_id,v_automation_id,p_now,'scheduled');
  v_status := v_start->>'status';
  if v_status is distinct from 'started' then
    return v_start || jsonb_build_object('runtime_host','supabase_pg_cron','backend_function','private.run_meplus_hourly_backend_scheduler');
  end if;
  v_run_id := (v_start->>'run_id')::uuid;
  v_probe := coalesce(v_start->'probe','{}'::jsonb);
  v_logical_hour := (v_start->>'logical_hour')::timestamptz;
  v_tz := coalesce(v_probe->>'timezone','Europe/Berlin');
  v_occurrence_date := (v_logical_hour at time zone v_tz)::date;
  v_policy_version := v_start->'policy'->'scheduler'->>'policy_version';

  begin
    for v_due in select value from jsonb_array_elements(coalesce(v_probe->'due_routines','[]'::jsonb))
    loop
      v_one := public.scheduler_materialize_routine_action(p_user_id,(v_due->>'routine_id')::uuid,(v_due->>'schedule_id')::uuid,v_occurrence_date,v_run_id);
      v_materialized := v_materialized || jsonb_build_array(v_one);
    end loop;

    insert into public.scheduler_dispatches(
      user_id,scheduler_key,scheduler_run_id,logical_hour,dispatch_kind,status,reasons,payload,last_error,updated_at
    ) values (
      p_user_id,'hourly_task_scheduler',v_run_id,v_logical_hour,'reasoning_and_execution_surface','pending',
      coalesce(v_probe->'reasons','[]'::jsonb),
      jsonb_build_object(
        'policy_version',v_policy_version,'materialized_routine_actions',v_materialized,
        'newly_overdue_actions',coalesce(v_probe->'newly_overdue_actions','[]'::jsonb),
        'pending_scheduler_signals',coalesce(v_probe->'pending_scheduler_signals','[]'::jsonb),
        'external_refresh_due',coalesce((v_probe->>'external_refresh_due')::boolean,false),
        'execution_surface','todoist','runtime_host','supabase_pg_cron','reasoning_runtime','me-plus-reasoning-worker'
      ),null,clock_timestamp()
    )
    on conflict (user_id,scheduler_key,logical_hour,dispatch_kind)
    do update set
      scheduler_run_id=excluded.scheduler_run_id,reasons=excluded.reasons,payload=excluded.payload,
      status=case when public.scheduler_dispatches.status='completed' then public.scheduler_dispatches.status else 'pending' end,
      last_error=case when public.scheduler_dispatches.status='completed' then public.scheduler_dispatches.last_error else null end,
      available_at=case when public.scheduler_dispatches.status='completed' then public.scheduler_dispatches.available_at else clock_timestamp() end,
      claimed_at=case when public.scheduler_dispatches.status='completed' then public.scheduler_dispatches.claimed_at else null end,
      updated_at=clock_timestamp()
    returning id into v_dispatch_id;

    begin
      v_wake_request_id := private.wake_meplus_reasoning_worker();
    exception when others then
      v_wake_request_id := null;
      update public.scheduler_dispatches
      set last_error=jsonb_build_object('error_type','ai_worker_wake_failed','message',sqlerrm,
        'note','Dispatch remains pending and the recovery cron will retry the worker.'),updated_at=clock_timestamp()
      where id=v_dispatch_id and status='pending';
    end;
  exception when others then
    v_error := jsonb_build_object('error_type','backend_scheduler_execution_exception','sqlstate',sqlstate,'message',sqlerrm);
    v_finish := public.finish_hourly_scheduler_run(p_user_id,v_run_id,'failed',jsonb_build_array('supabase_backend'),
      jsonb_build_object('materialized_routine_actions',v_materialized),v_error,v_policy_version,v_automation_id);
    return jsonb_build_object('status','failed','run_id',v_run_id,'error',v_error,'finish',v_finish);
  end;

  v_finish := public.finish_hourly_scheduler_run(
    p_user_id,v_run_id,'completed',jsonb_build_array('supabase_backend'),
    jsonb_build_object('runtime_host','supabase_pg_cron','materialized_routine_count',jsonb_array_length(v_materialized),
      'materialized_routine_actions',v_materialized,'dispatch_id',v_dispatch_id,'ai_reasoning_status','queued',
      'ai_worker_wake_request_id',v_wake_request_id,'external_execution_status','awaiting_ai_reasoning'),
    null,v_policy_version,v_automation_id
  );

  return jsonb_build_object('status','completed','runtime_host','supabase_pg_cron','run_id',v_run_id,
    'logical_hour',v_logical_hour,'materialized_routine_count',jsonb_array_length(v_materialized),'dispatch_id',v_dispatch_id,
    'ai_reasoning_status','queued','ai_worker_wake_request_id',v_wake_request_id,'finish',v_finish);
end;
$$;

revoke all on function private.run_meplus_hourly_backend_scheduler(uuid,timestamptz) from public, anon, authenticated;

DO $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='meplus-ai-reasoning-worker-retry'
  loop perform cron.unschedule(v_jobid); end loop;
end $$;

select cron.schedule(
  'meplus-ai-reasoning-worker-retry',
  '*/5 * * * *',
  $cron$select private.wake_meplus_reasoning_worker();$cron$
);
