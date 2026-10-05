do $patch$
declare
  d text;
begin
  select pg_get_functiondef('private.scheduler_runtime_health_one(uuid,text,timestamptz)'::regprocedure)
  into d;

  if position('v_last_terminal timestamptz;' in d)=0
     or position('if h.last_status=''failed''' in d)=0 then
    raise exception 'scheduler_runtime_health_one contract differs; review before patch';
  end if;

  d := replace(
    d,
    'v_last_terminal timestamptz;',
    'v_last_terminal timestamptz;
  v_latest_run_status text;
  v_latest_run_triggered_at timestamptz;
  v_latest_run_finished_at timestamptz;
  v_latest_run_error jsonb;'
  );

  d := replace(
    d,
    '  v_last_terminal := greatest(
    coalesce(h.last_succeeded_at,''-infinity''::timestamptz),
    coalesce(h.last_failed_at,''-infinity''::timestamptz)
  );',
    '  v_last_terminal := greatest(
    coalesce(h.last_succeeded_at,''-infinity''::timestamptz),
    coalesce(h.last_failed_at,''-infinity''::timestamptz)
  );

  select rl.status, rl.triggered_at, rl.finished_at, rl.error
  into v_latest_run_status, v_latest_run_triggered_at, v_latest_run_finished_at, v_latest_run_error
  from public.scheduler_run_log rl
  where rl.user_id=p_user_id
    and rl.scheduler_key=p_scheduler_key
  order by rl.triggered_at desc, rl.created_at desc
  limit 1;'
  );

  d := replace(
    d,
    '  if h.last_status=''failed''
     and (h.last_succeeded_at is null or h.last_failed_at >= h.last_succeeded_at)
     and v_status not in (''sleep_blackout'',''recovering'') then
    v_status := ''failed'';
    v_reason := ''latest_heartbeat_failed'';
  end if;',
    '  if coalesce(r.health_mode,''cadence'') <> ''work_driven''
     and v_latest_run_status = ''failed''
     and v_status not in (''sleep_blackout'',''recovering'') then
    v_status := ''failed'';
    v_reason := ''latest_logical_run_failed'';
  elsif coalesce(r.health_mode,''cadence'') <> ''work_driven''
     and v_latest_run_status is null
     and h.last_status=''failed''
     and (h.last_succeeded_at is null or h.last_failed_at >= h.last_succeeded_at)
     and v_status not in (''sleep_blackout'',''recovering'') then
    v_status := ''failed'';
    v_reason := ''latest_heartbeat_failed'';
  end if;'
  );

  d := replace(
    d,
    '    ''pending_since'',v_pending_since
  );',
    '    ''pending_since'',v_pending_since,
    ''latest_logical_run_status'',v_latest_run_status,
    ''latest_logical_run_triggered_at'',v_latest_run_triggered_at,
    ''latest_logical_run_finished_at'',v_latest_run_finished_at,
    ''latest_logical_run_error'',v_latest_run_error
  );'
  );

  execute d;
end;
$patch$;

comment on function private.scheduler_runtime_health_one(uuid,text,timestamptz)
is 'Canonical registry-driven scheduler health evaluator. Work-driven child health is determined by pending-work/recovery state rather than stale terminal heartbeat errors. Scheduler runtimes with run logs use the latest logical run by triggered_at as terminal authority so a late callback from an older run cannot poison a newer successful run.';
