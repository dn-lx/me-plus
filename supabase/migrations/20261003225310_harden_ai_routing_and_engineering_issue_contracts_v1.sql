alter table private.engineering_issues
  add column if not exists depends_on text[] not null default '{}'::text[],
  add column if not exists conflicts_with text[] not null default '{}'::text[],
  add column if not exists regression_surface text[] not null default '{}'::text[],
  add column if not exists validation_contract jsonb not null default '{}'::jsonb,
  add column if not exists fix_group text,
  add column if not exists fix_order smallint;

update private.engineering_issues
set
  depends_on = case
    when jsonb_typeof(metadata->'depends_on')='array'
      then array(select jsonb_array_elements_text(metadata->'depends_on'))
    else depends_on end,
  conflicts_with = case
    when jsonb_typeof(metadata->'conflicts_with')='array'
      then array(select jsonb_array_elements_text(metadata->'conflicts_with'))
    else conflicts_with end,
  regression_surface = case
    when jsonb_typeof(metadata->'regression_surface')='array'
      then array(select jsonb_array_elements_text(metadata->'regression_surface'))
    else regression_surface end,
  validation_contract = case
    when jsonb_typeof(metadata->'validation_contract')='object'
      then metadata->'validation_contract'
    else validation_contract end,
  fix_group = coalesce(fix_group, nullif(metadata->>'fix_group','')),
  fix_order = coalesce(
    fix_order,
    case when (metadata->>'fix_order') ~ '^[0-9]+$' then (metadata->>'fix_order')::smallint else null end
  );

create or replace function public.server_gateway_get_ai_routing_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'routing_policy_version',
      coalesce((select max(policy_version) from private.ai_reasoning_routes where active), 'meplus-ai-routing-v1'),
    'routes',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'route_key', route_key,
            'purpose', purpose,
            'model_key', model_key,
            'fallback_model_key', fallback_model_key,
            'reasoning_effort', reasoning_effort,
            'max_output_tokens', max_output_tokens,
            'priority', priority,
            'match_rules', match_rules,
            'policy_version', policy_version,
            'active', active,
            'metadata', metadata
          ) order by priority, route_key
        )
        from private.ai_reasoning_routes
        where active
      ), '[]'::jsonb),
    'models',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'model_key', model_key,
            'provider', provider,
            'api_model', api_model,
            'capability_tier', capability_tier,
            'default_reasoning_effort', default_reasoning_effort,
            'supports_structured_output', supports_structured_output,
            'active', active,
            'pricing_source', pricing_source,
            'pricing', pricing,
            'metadata', metadata
          ) order by capability_tier, model_key
        )
        from private.ai_model_registry
        where active
      ), '[]'::jsonb)
  );
$$;

revoke all on function public.server_gateway_get_ai_routing_config() from public, anon, authenticated;
grant execute on function public.server_gateway_get_ai_routing_config() to service_role;

create or replace function public.server_gateway_list_engineering_issues(
  p_lifecycle_status text[] default null,
  p_limit integer default 200
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_rank, x.queue_rank nulls last, x.issue_key), '[]'::jsonb)
  from (
    select
      issue_key, domain, area, severity, execution_priority, queue_rank, lifecycle_status,
      status_detail, is_blocked, blocked_reason, priority_reason, first_observed, last_verified,
      symptom_impact, root_cause, current_state_repair, next_action, evidence_source,
      depends_on, conflicts_with, regression_surface, validation_contract, fix_group, fix_order,
      metadata, priority_rank, updated_at
    from private.engineering_issues
    where (p_lifecycle_status is null or lifecycle_status = any(p_lifecycle_status))
    order by priority_rank, queue_rank nulls last, issue_key
    limit greatest(1, least(coalesce(p_limit,200),500))
  ) x;
$$;

revoke all on function public.server_gateway_list_engineering_issues(text[],integer) from public, anon, authenticated;
grant execute on function public.server_gateway_list_engineering_issues(text[],integer) to service_role;

create or replace function public.server_gateway_upsert_engineering_issue(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := upper(btrim(p_input->>'issue_key'));
  v_result jsonb;
begin
  if v_key is null or v_key !~ '^[A-Z]+-[0-9]{3}$' then
    raise exception 'invalid_issue_key';
  end if;

  insert into private.engineering_issues(
    issue_key, domain, area, severity, execution_priority, queue_rank, lifecycle_status,
    status_detail, is_blocked, blocked_reason, priority_reason, first_observed, last_verified,
    symptom_impact, root_cause, current_state_repair, next_action, evidence_source,
    depends_on, conflicts_with, regression_surface, validation_contract, fix_group, fix_order,
    metadata, source_file_id, source_row_number, source_last_modified_at
  )
  values(
    v_key,
    coalesce(nullif(p_input->>'domain',''),'Engineering'),
    coalesce(nullif(p_input->>'area',''),'Audit finding'),
    coalesce(nullif(p_input->>'severity',''),'Medium'),
    coalesce(nullif(p_input->>'execution_priority',''), coalesce(nullif(p_input->>'severity',''),'Medium')),
    case when (p_input->>'queue_rank') ~ '^[0-9]+$' then (p_input->>'queue_rank')::integer else null end,
    coalesce(nullif(p_input->>'lifecycle_status',''),'open'),
    coalesce(p_input->>'status_detail',''),
    coalesce((p_input->>'is_blocked')::boolean,false),
    nullif(p_input->>'blocked_reason',''),
    nullif(p_input->>'priority_reason',''),
    coalesce(nullif(p_input->>'first_observed','')::date, current_date),
    coalesce(nullif(p_input->>'last_verified','')::date, current_date),
    coalesce(p_input->>'symptom_impact',''),
    nullif(p_input->>'root_cause',''),
    nullif(p_input->>'current_state_repair',''),
    nullif(p_input->>'next_action',''),
    nullif(p_input->>'evidence_source',''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_input->'depends_on','[]'::jsonb))), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_input->'conflicts_with','[]'::jsonb))), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_input->'regression_surface','[]'::jsonb))), '{}'::text[]),
    coalesce(p_input->'validation_contract','{}'::jsonb),
    nullif(p_input->>'fix_group',''),
    case when (p_input->>'fix_order') ~ '^[0-9]+$' then (p_input->>'fix_order')::smallint else null end,
    coalesce(p_input->'metadata','{}'::jsonb),
    nullif(p_input->>'source_file_id',''),
    case when (p_input->>'source_row_number') ~ '^[0-9]+$' then (p_input->>'source_row_number')::integer else null end,
    nullif(p_input->>'source_last_modified_at','')::timestamptz
  )
  on conflict (issue_key) do update set
    domain=excluded.domain,
    area=excluded.area,
    severity=excluded.severity,
    execution_priority=excluded.execution_priority,
    queue_rank=excluded.queue_rank,
    lifecycle_status=excluded.lifecycle_status,
    status_detail=excluded.status_detail,
    is_blocked=excluded.is_blocked,
    blocked_reason=excluded.blocked_reason,
    priority_reason=excluded.priority_reason,
    last_verified=excluded.last_verified,
    symptom_impact=excluded.symptom_impact,
    root_cause=excluded.root_cause,
    current_state_repair=excluded.current_state_repair,
    next_action=excluded.next_action,
    evidence_source=excluded.evidence_source,
    depends_on=excluded.depends_on,
    conflicts_with=excluded.conflicts_with,
    regression_surface=excluded.regression_surface,
    validation_contract=excluded.validation_contract,
    fix_group=excluded.fix_group,
    fix_order=excluded.fix_order,
    metadata=private.engineering_issues.metadata || excluded.metadata,
    source_file_id=coalesce(excluded.source_file_id,private.engineering_issues.source_file_id),
    source_row_number=coalesce(excluded.source_row_number,private.engineering_issues.source_row_number),
    source_last_modified_at=coalesce(excluded.source_last_modified_at,private.engineering_issues.source_last_modified_at),
    updated_at=now();

  select to_jsonb(e) into v_result
  from private.engineering_issues e
  where e.issue_key=v_key;

  return v_result;
end;
$$;

revoke all on function public.server_gateway_upsert_engineering_issue(jsonb) from public, anon, authenticated;
grant execute on function public.server_gateway_upsert_engineering_issue(jsonb) to service_role;
