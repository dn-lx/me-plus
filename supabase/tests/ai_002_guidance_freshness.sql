begin;

do $test$
declare
  u uuid;
  r1 uuid;
  r2 uuid;
  d1 uuid;
  d2 uuid;
  result jsonb;
begin
  select id into u from public.profiles order by created_at limit 1;
  if u is null then raise exception 'guidance freshness fixture user missing'; end if;

  insert into public.recommendations(
    user_id,recommendation_type,domain,generated_at,expires_at,title,rationale,
    confidence,priority,proposed_action,evidence,constraints_considered,policy_version
  ) values (
    u,'scheduler_reasoning','nutrition','2099-01-01T10:00:00Z','2099-01-02T10:00:00Z',
    '__GUIDANCE_CURRENT__','current recommendation','high',1,'{}','[]','[]','test'
  ) returning id into r1;

  insert into public.recommendations(
    user_id,recommendation_type,domain,generated_at,expires_at,title,rationale,
    confidence,priority,proposed_action,evidence,constraints_considered,policy_version
  ) values (
    u,'scheduler_reasoning','nutrition','2099-01-01T09:00:00Z','2099-01-02T10:00:00Z',
    '__GUIDANCE_OLD__','older recommendation','high',1,'{}','[]','[]','test'
  ) returning id into r2;

  insert into public.scheduler_dispatches(
    user_id,scheduler_key,logical_hour,dispatch_kind,status,reasons,payload,completed_at
  ) values (
    u,'hourly_task_scheduler','2099-01-01T10:00:00Z','reasoning_and_execution_surface',
    'completed','[]',
    jsonb_build_object(
      'ai_reasoning',jsonb_build_object(
        'decision','recommend',
        'recommendation_ids',jsonb_build_array(r1::text),
        'personal_state_snapshot_id',null
      )
    ),
    '2099-01-01T10:00:10Z'
  ) returning id into d1;

  result := public.server_gateway_get_recommendation_history(u,20);
  if jsonb_array_length(result) <> 1
     or result->0->>'id' <> r1::text
     or result->0->>'title' <> '__GUIDANCE_CURRENT__' then
    raise exception 'latest recommend projection failed: %',result;
  end if;

  insert into public.scheduler_dispatches(
    user_id,scheduler_key,logical_hour,dispatch_kind,status,reasons,payload,completed_at
  ) values (
    u,'hourly_task_scheduler','2099-01-01T11:00:00Z','reasoning_and_execution_surface',
    'completed','[]',
    jsonb_build_object(
      'ai_reasoning',jsonb_build_object(
        'decision','noop',
        'recommendation_ids','[]'::jsonb,
        'personal_state_snapshot_id',null
      )
    ),
    '2099-01-01T11:00:10Z'
  ) returning id into d2;

  result := public.server_gateway_get_recommendation_history(u,20);
  if result <> '[]'::jsonb then
    raise exception 'latest noop did not clear current guidance: %',result;
  end if;
end
$test$;

rollback;

select 'PASS: current Guidance follows latest reasoning decision and noop clears stale items' as result;
