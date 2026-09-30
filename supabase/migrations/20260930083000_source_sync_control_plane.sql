create table if not exists private.source_sync_leases (
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete cascade,
  sync_purpose text not null check (char_length(sync_purpose) between 1 and 80),
  run_key text not null check (char_length(run_key) between 1 and 240),
  sync_run_id uuid not null,
  attempt integer not null check (attempt between 1 and 20),
  max_attempts integer not null check (max_attempts between 1 and 20),
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, data_source_id, sync_purpose),
  constraint source_sync_leases_run_fkey
    foreign key (sync_run_id)
    references public.source_sync_runs(id)
    on delete cascade
    deferrable initially deferred
);

alter table private.source_sync_leases enable row level security;
revoke all on private.source_sync_leases from public, anon, authenticated, service_role;

create index if not exists source_sync_runs_run_key_idx
  on public.source_sync_runs (
    user_id,
    data_source_id,
    ((metadata->>'syncPurpose')),
    ((metadata->>'runKey'))
  )
  where metadata ? 'runKey';

create or replace function private.guard_source_sync_run_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_purpose text;
  v_run_key text;
  v_bucket timestamptz;
  v_lease_seconds integer;
  v_max_attempts integer;
  v_attempt integer;
  v_lease private.source_sync_leases%rowtype;
  v_running public.source_sync_runs%rowtype;
  v_lock_key bigint;
begin
  if new.status <> 'running' then
    return new;
  end if;

  v_purpose := coalesce(nullif(btrim(new.metadata->>'syncPurpose'),''),'source_sync');

  -- Existing app callers do not yet supply a logical run key. Give those calls
  -- a deterministic minute bucket so immediate retries converge without making
  -- ordinary manual refreshes several minutes later look like the same run.
  v_bucket := date_trunc('minute',v_now);
  v_run_key := coalesce(
    nullif(btrim(new.metadata->>'runKey'),''),
    'source_sync:' || new.data_source_id::text || ':' ||
      to_char(v_bucket at time zone 'UTC','YYYY-MM-DD"T"HH24:MI"Z"')
  );

  v_lease_seconds := greatest(
    60,
    least(coalesce(nullif(new.metadata->>'leaseSeconds','')::integer,900),3600)
  );
  v_max_attempts := greatest(
    1,
    least(coalesce(nullif(new.metadata->>'maxAttempts','')::integer,3),10)
  );

  -- The live schema already enforces one running row per source. Serialize on
  -- that same source-wide invariant; sync_purpose remains part of provenance
  -- and retry accounting, not a loophole for parallel provider work.
  v_lock_key := hashtextextended(
    new.user_id::text || ':' || new.data_source_id::text,
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select * into v_lease
  from private.source_sync_leases l
  where l.user_id=new.user_id
    and l.data_source_id=new.data_source_id
    and l.expires_at > v_now
  order by l.expires_at desc
  limit 1
  for update;

  if found then
    raise exception using
      errcode='P0001',
      message='source_sync_overlap',
      detail=jsonb_build_object(
        'sync_run_id',v_lease.sync_run_id,
        'sync_purpose',v_lease.sync_purpose,
        'run_key',v_lease.run_key,
        'attempt',v_lease.attempt,
        'lease_expires_at',v_lease.expires_at
      )::text;
  end if;

  -- Expired leases are recovery evidence, not blockers.
  delete from private.source_sync_leases
  where user_id=new.user_id
    and data_source_id=new.data_source_id
    and expires_at <= v_now;

  -- Recover a legacy/orphaned running row even when it predates the lease
  -- table. Recent work is treated as a real overlap; only stale work is failed.
  select * into v_running
  from public.source_sync_runs r
  where r.user_id=new.user_id
    and r.data_source_id=new.data_source_id
    and r.status='running'
  order by r.started_at desc
  limit 1
  for update;

  if found then
    if v_running.started_at > v_now - make_interval(secs => v_lease_seconds) then
      raise exception using
        errcode='P0001',
        message='source_sync_overlap',
        detail=jsonb_build_object(
          'sync_run_id',v_running.id,
          'run_key',v_running.metadata->>'runKey',
          'started_at',v_running.started_at
        )::text;
    end if;

    update public.source_sync_runs
    set status='failed',
        finished_at=coalesce(finished_at,v_now),
        error_code=coalesce(error_code,'orphaned_running_sync_recovered'),
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'orphanedRunRecoveredAt',v_now
        )
    where id=v_running.id
      and status='running';
  end if;

  if exists (
    select 1
    from public.source_sync_runs r
    where r.user_id=new.user_id
      and r.data_source_id=new.data_source_id
      and r.status='completed'
      and r.metadata->>'syncPurpose'=v_purpose
      and r.metadata->>'runKey'=v_run_key
  ) then
    raise exception using
      errcode='P0001',
      message='source_sync_already_completed',
      detail=jsonb_build_object('run_key',v_run_key)::text;
  end if;

  select count(*)::integer into v_attempt
  from public.source_sync_runs r
  where r.user_id=new.user_id
    and r.data_source_id=new.data_source_id
    and r.metadata->>'syncPurpose'=v_purpose
    and r.metadata->>'runKey'=v_run_key;

  if v_attempt >= v_max_attempts then
    raise exception using
      errcode='P0001',
      message='source_sync_retry_exhausted',
      detail=jsonb_build_object(
        'run_key',v_run_key,
        'attempts',v_attempt,
        'max_attempts',v_max_attempts
      )::text;
  end if;

  v_attempt := v_attempt + 1;

  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
    'syncPurpose',v_purpose,
    'runKey',v_run_key,
    'attempt',v_attempt,
    'maxAttempts',v_max_attempts,
    'leaseSeconds',v_lease_seconds
  );

  insert into private.source_sync_leases(
    user_id,data_source_id,sync_purpose,run_key,sync_run_id,
    attempt,max_attempts,acquired_at,expires_at,updated_at
  ) values (
    new.user_id,new.data_source_id,v_purpose,v_run_key,new.id,
    v_attempt,v_max_attempts,v_now,
    v_now + make_interval(secs => v_lease_seconds),v_now
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

  return new;
end;
$$;

create or replace function private.release_source_sync_lease()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purpose text;
begin
  if old.status='running' and new.status in ('completed','failed') then
    v_purpose := coalesce(nullif(new.metadata->>'syncPurpose',''),'source_sync');

    delete from private.source_sync_leases
    where user_id=new.user_id
      and data_source_id=new.data_source_id
      and sync_purpose=v_purpose
      and sync_run_id=new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists source_sync_run_guard_before_insert on public.source_sync_runs;
create trigger source_sync_run_guard_before_insert
before insert on public.source_sync_runs
for each row execute function private.guard_source_sync_run_insert();

drop trigger if exists source_sync_run_release_after_terminal on public.source_sync_runs;
create trigger source_sync_run_release_after_terminal
after update of status on public.source_sync_runs
for each row execute function private.release_source_sync_lease();

revoke all on function private.guard_source_sync_run_insert()
from public, anon, authenticated, service_role;
revoke all on function private.release_source_sync_lease()
from public, anon, authenticated, service_role;
