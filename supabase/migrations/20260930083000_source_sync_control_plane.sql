create table if not exists private.source_sync_leases (
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete cascade,
  sync_purpose text not null check (char_length(sync_purpose) between 1 and 80),
  run_key text not null check (char_length(run_key) between 1 and 240),
  sync_run_id uuid not null references public.source_sync_runs(id) on delete cascade,
  attempt integer not null check (attempt between 1 and 20),
  max_attempts integer not null check (max_attempts between 1 and 20),
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, data_source_id, sync_purpose)
);

alter table private.source_sync_leases enable row level security;
revoke all on private.source_sync_leases from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.source_sync_leases to service_role;

create index if not exists source_sync_runs_run_key_idx
  on public.source_sync_runs (
    user_id,
    data_source_id,
    ((metadata->>'syncPurpose')),
    ((metadata->>'runKey'))
  )
  where metadata ? 'runKey';

create or replace function public.claim_source_sync_execution(
  p_user_id uuid,
  p_data_source_id uuid,
  p_sync_purpose text,
  p_run_key text,
  p_lease_seconds integer default 900,
  p_max_attempts integer default 3,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_lease private.source_sync_leases%rowtype;
  v_running public.source_sync_runs%rowtype;
  v_existing public.source_sync_runs%rowtype;
  v_attempt integer;
  v_run_id uuid;
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds,900), 3600));
  v_max_attempts integer := greatest(1, least(coalesce(p_max_attempts,3), 10));
begin
  if p_user_id is null or p_data_source_id is null then
    raise exception 'user_id and data_source_id are required';
  end if;
  if nullif(btrim(p_sync_purpose),'') is null or nullif(btrim(p_run_key),'') is null then
    raise exception 'sync_purpose and run_key are required';
  end if;

  if not exists (
    select 1
    from public.data_sources ds
    where ds.id=p_data_source_id and ds.user_id=p_user_id
  ) then
    raise exception 'unknown data source for user';
  end if;

  select * into v_lease
  from private.source_sync_leases l
  where l.user_id=p_user_id
    and l.data_source_id=p_data_source_id
    and l.sync_purpose=p_sync_purpose
  for update;

  if found and v_lease.expires_at > p_now then
    return jsonb_build_object(
      'status','skipped_overlap',
      'sync_run_id',v_lease.sync_run_id,
      'run_key',v_lease.run_key,
      'attempt',v_lease.attempt,
      'lease_expires_at',v_lease.expires_at
    );
  end if;

  if found then
    update public.source_sync_runs
    set status='failed',
        finished_at=coalesce(finished_at,p_now),
        error_code=coalesce(error_code,'stale_sync_lease_recovered'),
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'staleLeaseRecoveredAt',p_now
        )
    where id=v_lease.sync_run_id
      and user_id=p_user_id
      and data_source_id=p_data_source_id
      and status='running';

    delete from private.source_sync_leases
    where user_id=p_user_id
      and data_source_id=p_data_source_id
      and sync_purpose=p_sync_purpose;
  end if;

  select * into v_running
  from public.source_sync_runs r
  where r.user_id=p_user_id
    and r.data_source_id=p_data_source_id
    and r.status='running'
  order by r.started_at desc
  limit 1
  for update;

  if found then
    if v_running.started_at > p_now - make_interval(secs => v_lease_seconds) then
      return jsonb_build_object(
        'status','skipped_overlap',
        'sync_run_id',v_running.id,
        'run_key',v_running.metadata->>'runKey',
        'attempt',coalesce((v_running.metadata->>'attempt')::integer,1)
      );
    end if;

    update public.source_sync_runs
    set status='failed',
        finished_at=p_now,
        error_code=coalesce(error_code,'orphaned_running_sync_recovered'),
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'orphanedRunRecoveredAt',p_now
        )
    where id=v_running.id and status='running';
  end if;

  select * into v_existing
  from public.source_sync_runs r
  where r.user_id=p_user_id
    and r.data_source_id=p_data_source_id
    and r.metadata->>'syncPurpose'=p_sync_purpose
    and r.metadata->>'runKey'=p_run_key
    and r.status='completed'
  order by r.finished_at desc nulls last, r.started_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status','already_completed',
      'sync_run_id',v_existing.id,
      'run_key',p_run_key,
      'attempt',coalesce((v_existing.metadata->>'attempt')::integer,1),
      'records_seen',v_existing.records_seen,
      'records_created',v_existing.records_created,
      'records_updated',v_existing.records_updated
    );
  end if;

  select count(*)::integer into v_attempt
  from public.source_sync_runs r
  where r.user_id=p_user_id
    and r.data_source_id=p_data_source_id
    and r.metadata->>'syncPurpose'=p_sync_purpose
    and r.metadata->>'runKey'=p_run_key;

  if v_attempt >= v_max_attempts then
    select * into v_existing
    from public.source_sync_runs r
    where r.user_id=p_user_id
      and r.data_source_id=p_data_source_id
      and r.metadata->>'syncPurpose'=p_sync_purpose
      and r.metadata->>'runKey'=p_run_key
    order by r.started_at desc
    limit 1;

    return jsonb_build_object(
      'status','retry_exhausted',
      'sync_run_id',v_existing.id,
      'run_key',p_run_key,
      'attempts',v_attempt,
      'max_attempts',v_max_attempts
    );
  end if;

  v_attempt := v_attempt + 1;

  insert into public.source_sync_runs(
    user_id,data_source_id,status,metadata
  ) values (
    p_user_id,p_data_source_id,'running',
    jsonb_build_object(
      'ingestion','me-plus-source-sync-v2',
      'syncPurpose',p_sync_purpose,
      'runKey',p_run_key,
      'attempt',v_attempt,
      'maxAttempts',v_max_attempts,
      'leaseSeconds',v_lease_seconds
    )
  )
  returning id into v_run_id;

  insert into private.source_sync_leases(
    user_id,data_source_id,sync_purpose,run_key,sync_run_id,
    attempt,max_attempts,acquired_at,expires_at,updated_at
  ) values (
    p_user_id,p_data_source_id,p_sync_purpose,p_run_key,v_run_id,
    v_attempt,v_max_attempts,p_now,
    p_now + make_interval(secs => v_lease_seconds),p_now
  )
  on conflict (user_id,data_source_id,sync_purpose)
  do update set
    run_key=excluded.run_key,
    sync_run_id=excluded.sync_run_id,
    attempt=excluded.attempt,
    max_attempts=excluded.max_attempts,
    acquired_at=excluded.acquired_at,
    expires_at=excluded.expires_at,
    updated_at=excluded.updated_at;

  return jsonb_build_object(
    'status','started',
    'sync_run_id',v_run_id,
    'run_key',p_run_key,
    'attempt',v_attempt,
    'max_attempts',v_max_attempts,
    'lease_expires_at',p_now + make_interval(secs => v_lease_seconds)
  );
end;
$$;

create or replace function public.finish_source_sync_execution(
  p_user_id uuid,
  p_data_source_id uuid,
  p_sync_purpose text,
  p_sync_run_id uuid,
  p_status text,
  p_records_seen integer default 0,
  p_records_created integer default 0,
  p_records_updated integer default 0,
  p_error_code text default null,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_run public.source_sync_runs%rowtype;
  v_existing_status text;
begin
  if p_status not in ('completed','failed') then
    raise exception 'invalid terminal source sync status';
  end if;

  select * into v_run
  from public.source_sync_runs
  where id=p_sync_run_id
    and user_id=p_user_id
    and data_source_id=p_data_source_id
  for update;

  if not found then
    raise exception 'source sync run not found';
  end if;

  v_existing_status := v_run.status;

  if v_existing_status in ('completed','failed') then
    if v_existing_status<>p_status then
      raise exception 'conflicting terminal source sync transition';
    end if;

    delete from private.source_sync_leases
    where user_id=p_user_id
      and data_source_id=p_data_source_id
      and sync_purpose=p_sync_purpose
      and sync_run_id=p_sync_run_id;

    return jsonb_build_object(
      'status',v_existing_status,
      'sync_run_id',p_sync_run_id,
      'idempotent',true
    );
  end if;

  if v_existing_status<>'running' then
    raise exception 'source sync run is not running';
  end if;

  update public.source_sync_runs
  set status=p_status,
      finished_at=p_now,
      records_seen=greatest(coalesce(p_records_seen,0),0),
      records_created=greatest(coalesce(p_records_created,0),0),
      records_updated=greatest(coalesce(p_records_updated,0),0),
      error_code=case
        when p_status='failed' then left(coalesce(p_error_code,'source_sync_failed'),200)
        else null
      end,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'terminalizedAt',p_now
      )
  where id=p_sync_run_id;

  delete from private.source_sync_leases
  where user_id=p_user_id
    and data_source_id=p_data_source_id
    and sync_purpose=p_sync_purpose
    and sync_run_id=p_sync_run_id;

  return jsonb_build_object(
    'status',p_status,
    'sync_run_id',p_sync_run_id,
    'idempotent',false
  );
end;
$$;

revoke all on function public.claim_source_sync_execution(uuid,uuid,text,text,integer,integer,timestamptz)
from public,anon,authenticated;
revoke all on function public.finish_source_sync_execution(uuid,uuid,text,uuid,text,integer,integer,integer,text,timestamptz)
from public,anon,authenticated;
grant execute on function public.claim_source_sync_execution(uuid,uuid,text,text,integer,integer,timestamptz)
to service_role;
grant execute on function public.finish_source_sync_execution(uuid,uuid,text,uuid,text,integer,integer,integer,text,timestamptz)
to service_role;

create or replace function public.finish_source_provider_refresh(
  p_user_id uuid,
  p_scheduler_run_id uuid,
  p_sync_run_id uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb,
  p_error jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.scheduler_run_log%rowtype;
  v_policy_version text;
  v_terminal_status text;
begin
  if p_status not in ('completed','failed') then
    raise exception 'invalid provider refresh terminal status';
  end if;

  select * into v_run
  from public.scheduler_run_log
  where id=p_scheduler_run_id
    and user_id=p_user_id
    and scheduler_key='source_provider_refresh'
  for update;

  if not found then
    raise exception 'provider refresh scheduler run not found';
  end if;

  if v_run.status in ('completed','failed','no_op') then
    if v_run.status<>p_status then
      raise exception 'conflicting provider refresh terminal transition';
    end if;
    return jsonb_build_object(
      'status',v_run.status,
      'run_id',v_run.id,
      'idempotent',true
    );
  end if;

  v_policy_version := coalesce(v_run.policy_version,'1.0-draft');
  v_terminal_status := p_status;

  update public.scheduler_run_log
  set status=v_terminal_status,
      finished_at=clock_timestamp(),
      sources_checked=jsonb_build_array('supabase_pg_cron','netlify_provider_worker'),
      changes_made=coalesce(changes_made,'{}'::jsonb) || jsonb_build_object(
        'sync_run_id',p_sync_run_id,
        'provider_result',coalesce(p_result,'{}'::jsonb)
      ),
      error=case when v_terminal_status='failed' then coalesce(p_error,'{}'::jsonb) else null end
  where id=v_run.id;

  perform public.release_scheduler_lease(
    p_user_id,'source_provider_refresh',v_run.id
  );

  perform public.record_scheduler_heartbeat(
    p_user_id,
    'source_provider_refresh',
    case when v_terminal_status='completed' then 'completed' else 'failed' end,
    v_policy_version,
    case when v_terminal_status='failed' then p_error else null end,
    1440,
    60,
    null,
    'supabase:pg_cron:meplus-source-provider-refresh'
  );

  return jsonb_build_object(
    'status',v_terminal_status,
    'run_id',v_run.id,
    'sync_run_id',p_sync_run_id,
    'idempotent',false
  );
end;
$$;

revoke all on function public.finish_source_provider_refresh(uuid,uuid,uuid,text,jsonb,jsonb)
from public,anon,authenticated;
grant execute on function public.finish_source_provider_refresh(uuid,uuid,uuid,text,jsonb,jsonb)
to service_role;

create or replace function private.meplus_source_provider_refresh_window_active(
  p_now timestamptz default clock_timestamp()
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_now at time zone 'Europe/Berlin')::time >= time '07:00'
     and (p_now at time zone 'Europe/Berlin')::time < time '07:01';
$$;

create or replace function private.run_meplus_source_provider_refresh(
  p_user_id uuid,
  p_now timestamptz default clock_timestamp(),
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy jsonb;
  v_version text;
  v_local_day date := (p_now at time zone 'Europe/Berlin')::date;
  v_idempotency_key text;
  v_run_id uuid;
  v_run_status text;
  v_lease boolean;
  v_source_id uuid;
  v_worker_url text;
  v_secret text;
  v_request_id bigint;
  v_error jsonb;
begin
  if not p_force and not private.meplus_source_provider_refresh_window_active(p_now) then
    return jsonb_build_object('status','outside_schedule');
  end if;

  perform public.record_scheduler_heartbeat(
    p_user_id,'source_provider_refresh','invoked',null,null,
    1440,60,null,'supabase:pg_cron:meplus-source-provider-refresh'
  );

  v_policy := public.get_scheduler_policy(p_user_id,'source_provider_refresh');

  if v_policy->'global' is null or v_policy->'scheduler' is null
     or coalesce((v_policy->'global'->>'checksum_valid')::boolean,false)=false
     or coalesce((v_policy->'scheduler'->>'checksum_valid')::boolean,false)=false
     or coalesce((v_policy->'global'->>'policy_schema_version')::integer,0)<>2
     or coalesce((v_policy->'scheduler'->>'policy_schema_version')::integer,0)<>2 then
    v_error := jsonb_build_object('error_type','source_provider_refresh_policy_invalid');
    perform public.record_scheduler_heartbeat(
      p_user_id,'source_provider_refresh','failed',null,v_error,
      1440,60,null,'supabase:pg_cron:meplus-source-provider-refresh'
    );
    return jsonb_build_object('status','failed','error',v_error);
  end if;

  v_version := v_policy->'scheduler'->>'policy_version';
  v_idempotency_key := 'source_provider_refresh:' || v_local_day::text || ':Europe/Berlin:' || v_version;

  v_run_id := public.begin_scheduler_run(
    p_user_id,
    'source_provider_refresh',
    'Source provider refresh',
    case when p_force then 'manual' else 'scheduled' end,
    'source-provider-refresh-v1',
    true,
    jsonb_build_array('daily_provider_refresh'),
    '[]'::jsonb,
    v_version,
    v_idempotency_key
  );

  select status into v_run_status
  from public.scheduler_run_log
  where id=v_run_id and user_id=p_user_id;

  if v_run_status in ('completed','failed','no_op') then
    perform public.record_scheduler_heartbeat(
      p_user_id,'source_provider_refresh','no_op',v_version,null,
      1440,60,null,'supabase:pg_cron:meplus-source-provider-refresh'
    );
    return jsonb_build_object(
      'status','no_op',
      'reason','idempotent_terminal_run',
      'terminal_run_status',v_run_status,
      'run_id',v_run_id
    );
  end if;

  if v_run_status='dispatched' then
    return jsonb_build_object(
      'status','skipped_overlap',
      'reason','idempotent_dispatched_run',
      'run_id',v_run_id
    );
  end if;

  v_lease := public.try_acquire_scheduler_lease(
    p_user_id,'source_provider_refresh',v_run_id,1200
  );

  if not v_lease then
    perform public.record_scheduler_heartbeat(
      p_user_id,'source_provider_refresh','skipped_overlap',v_version,null,
      1440,60,null,'supabase:pg_cron:meplus-source-provider-refresh'
    );
    return jsonb_build_object('status','skipped_overlap','run_id',v_run_id);
  end if;

  perform public.record_scheduler_heartbeat(
    p_user_id,'source_provider_refresh','started',v_version,null,
    1440,60,v_run_id,'supabase:pg_cron:meplus-source-provider-refresh'
  );

  select ds.id into v_source_id
  from public.data_sources ds
  where ds.user_id=p_user_id
    and ds.kind='bank_account_feed'
    and ds.provider='enable-banking'
    and ds.status in ('active','error')
  order by case when ds.status='active' then 0 else 1 end, ds.updated_at desc
  limit 1;

  if v_source_id is null then
    v_error := jsonb_build_object('error_type','provider_source_not_found');
    update public.scheduler_run_log
    set status='failed',finished_at=clock_timestamp(),error=v_error
    where id=v_run_id;
    perform public.release_scheduler_lease(p_user_id,'source_provider_refresh',v_run_id);
    perform public.record_scheduler_heartbeat(
      p_user_id,'source_provider_refresh','failed',v_version,v_error,
      1440,60,null,'supabase:pg_cron:meplus-source-provider-refresh'
    );
    return jsonb_build_object('status','failed','run_id',v_run_id,'error',v_error);
  end if;

  select decrypted_secret into v_worker_url
  from vault.decrypted_secrets
  where name='meplus_source_refresh_worker_url'
  order by created_at desc
  limit 1;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='meplus_source_refresh_wake_secret'
  order by created_at desc
  limit 1;

  if v_worker_url is null or v_secret is null then
    v_error := jsonb_build_object('error_type','provider_refresh_worker_config_missing');
    update public.scheduler_run_log
    set status='failed',finished_at=clock_timestamp(),error=v_error
    where id=v_run_id;
    perform public.release_scheduler_lease(p_user_id,'source_provider_refresh',v_run_id);
    perform public.record_scheduler_heartbeat(
      p_user_id,'source_provider_refresh','failed',v_version,v_error,
      1440,60,null,'supabase:pg_cron:meplus-source-provider-refresh'
    );
    return jsonb_build_object('status','failed','run_id',v_run_id,'error',v_error);
  end if;

  select net.http_post(
    url := v_worker_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-me-plus-scheduler-secret',v_secret
    ),
    body := jsonb_build_object(
      'user_id',p_user_id,
      'data_source_id',v_source_id,
      'scheduler_run_id',v_run_id,
      'run_key','daily:' || v_local_day::text || ':Europe/Berlin'
    ),
    timeout_milliseconds := 5000
  ) into v_request_id;

  update public.scheduler_run_log
  set status='dispatched',
      finished_at=null,
      sources_checked=jsonb_build_array('supabase_pg_cron'),
      changes_made=jsonb_build_object(
        'worker_request_id',v_request_id,
        'data_source_id',v_source_id,
        'provider_refresh_performed',false
      )
  where id=v_run_id;

  perform public.record_scheduler_heartbeat(
    p_user_id,'source_provider_refresh','dispatched',v_version,null,
    1440,60,v_run_id,'supabase:pg_cron:meplus-source-provider-refresh'
  );

  return jsonb_build_object(
    'status','dispatched',
    'run_id',v_run_id,
    'data_source_id',v_source_id,
    'worker_request_id',v_request_id
  );
exception when others then
  v_error := jsonb_build_object(
    'error_type','source_provider_refresh_dispatch_exception',
    'message',sqlerrm,
    'sqlstate',sqlstate
  );

  if v_run_id is not null then
    update public.scheduler_run_log
    set status='failed',finished_at=clock_timestamp(),error=v_error
    where id=v_run_id and status not in ('completed','failed','no_op');
    perform public.release_scheduler_lease(p_user_id,'source_provider_refresh',v_run_id);
  end if;

  perform public.record_scheduler_heartbeat(
    p_user_id,'source_provider_refresh','failed',v_version,v_error,
    1440,60,null,'supabase:pg_cron:meplus-source-provider-refresh'
  );

  return jsonb_build_object('status','failed','run_id',v_run_id,'error',v_error);
end;
$$;

revoke all on function private.meplus_source_provider_refresh_window_active(timestamptz)
from public,anon,authenticated,service_role;
revoke all on function private.run_meplus_source_provider_refresh(uuid,timestamptz,boolean)
from public,anon,authenticated,service_role;

select cron.schedule(
  'meplus-source-provider-refresh',
  '0 5,6 * * *',
  $$select private.run_meplus_source_provider_refresh(
    '459ab99b-d99d-492b-bb23-95144dbb1e47'::uuid,
    clock_timestamp(),
    false
  );$$
)
where not exists (
  select 1 from cron.job where jobname='meplus-source-provider-refresh'
);
