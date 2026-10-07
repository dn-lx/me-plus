
-- ENG-007: route-scoped bootstrap context, compact checkpoints, and persistent routing regression coverage.

update private.intent_routing_registry
set metadata = jsonb_set(
      coalesce(metadata,'{}'::jsonb),
      '{bootstrap_state_mode}',
      '"none"'::jsonb,
      true
    ),
    updated_at = clock_timestamp()
where status='active'
  and coalesce(metadata->>'bootstrap_state_mode','') <> 'none';

create or replace function private.get_latest_checkpoint_compact(
  p_user_id uuid,
  p_domains text[] default '{}'::text[]
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', i.id,
    'interface', i.interface,
    'session_type', i.session_type,
    'started_at', i.started_at,
    'ended_at', i.ended_at,
    'status', i.status,
    'domains', i.domains,
    'summary', i.summary,
    'decisions', coalesce(i.decisions,'[]'::jsonb),
    'open_loops', coalesce(i.open_loops,'[]'::jsonb),
    'next_actions', coalesce(i.next_actions,'[]'::jsonb),
    'entity_refs', coalesce(i.entity_refs,'[]'::jsonb),
    'document_refs', coalesce(i.document_refs,'[]'::jsonb),
    'personal_state_snapshot_id', i.personal_state_snapshot_id,
    'checkpoint_version', i.checkpoint_version,
    'updated_at', i.updated_at
  )
  from public.interaction_sessions i
  where i.user_id=p_user_id
    and i.status in ('active','closed')
    and (
      coalesce(cardinality(p_domains),0)=0
      or exists (
        select 1
        from unnest(i.domains) d
        join unnest(p_domains) q
          on lower(btrim(d))=lower(btrim(q))
      )
    )
  order by coalesce(i.ended_at,i.started_at,i.updated_at,i.created_at) desc
  limit 1
$function$;

revoke all on function private.get_latest_checkpoint_compact(uuid,text[]) from public, anon, authenticated;
grant execute on function private.get_latest_checkpoint_compact(uuid,text[]) to service_role;

create or replace function public.server_gateway_bootstrap_context_v2(
  p_user_id uuid,
  p_intent text default null,
  p_topics text[] default '{}'::text[],
  p_checkpoint_domains text[] default '{}'::text[],
  p_as_of timestamptz default clock_timestamp(),
  p_state_mode text default 'auto'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_route_result jsonb;
  v_route jsonb;
  v_route_topics text[] := '{}'::text[];
  v_spec_keys text[] := '{}'::text[];
  v_route_checkpoint_domains text[] := '{}'::text[];
  v_checkpoint_domains text[] := '{}'::text[];
  v_topics text[] := '{}'::text[];
  v_specs jsonb := '[]'::jsonb;
  v_checkpoint jsonb;
  v_state jsonb;
  v_requested_state_mode text := lower(btrim(coalesce(p_state_mode,'auto')));
  v_effective_state_mode text;
  v_has_route boolean := false;
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode='22023';
  end if;

  if v_requested_state_mode not in ('auto','none','summary','full') then
    raise exception 'invalid_state_mode' using errcode='22023';
  end if;

  v_route_result := public.server_gateway_resolve_intent(p_intent,p_topics,5);
  v_route := v_route_result->'selected';
  v_has_route := v_route is not null
                 and jsonb_typeof(v_route)='object'
                 and coalesce(v_route->>'route_key','') <> '';

  if v_has_route then
    select coalesce(array_agg(distinct lower(btrim(x))) filter (where btrim(x)<>''),'{}'::text[])
      into v_route_topics
      from jsonb_array_elements_text(coalesce(v_route->'topics','[]'::jsonb)) x;

    select coalesce(array_agg(distinct btrim(x)) filter (where btrim(x)<>''),'{}'::text[])
      into v_spec_keys
      from jsonb_array_elements_text(coalesce(v_route->'spec_keys','[]'::jsonb)) x;

    select coalesce(array_agg(distinct lower(btrim(x))) filter (where btrim(x)<>''),'{}'::text[])
      into v_route_checkpoint_domains
      from jsonb_array_elements_text(coalesce(v_route->'checkpoint_domains','[]'::jsonb)) x;
  end if;

  select coalesce(array_agg(distinct x) filter (where x<>''),'{}'::text[])
    into v_topics
  from (
    select lower(btrim(t)) x from unnest(coalesce(p_topics,'{}'::text[])) t
    union all
    select unnest(v_route_topics)
  ) q;

  -- A known route owns checkpoint scope. Generic topics are used only on fallback,
  -- avoiding unrelated "latest" checkpoints caused by broad topic overlap.
  select coalesce(array_agg(distinct x) filter (where x<>''),'{}'::text[])
    into v_checkpoint_domains
  from (
    select lower(btrim(t)) x from unnest(coalesce(p_checkpoint_domains,'{}'::text[])) t
    union all
    select unnest(v_route_checkpoint_domains) where v_has_route
    union all
    select unnest(v_topics) where not v_has_route
  ) q;

  if cardinality(v_spec_keys) > 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'spec_key',s.spec_key,
          'title',s.title,
          'drive_file_id',s.drive_file_id,
          'drive_url',s.drive_url,
          'domains',s.domains,
          'authoritative_for',s.authoritative_for,
          'priority',s.priority,
          'last_verified_at',s.last_verified_at,
          'metadata',s.metadata
        )
        order by array_position(v_spec_keys,s.spec_key),s.priority,s.spec_key
      ),
      '[]'::jsonb
    )
    into v_specs
    from private.spec_registry s
    where s.status='active' and s.spec_key=any(v_spec_keys);
  else
    v_specs := public.server_gateway_resolve_specs(v_topics);
  end if;

  v_checkpoint := private.get_latest_checkpoint_compact(p_user_id,v_checkpoint_domains);

  if v_requested_state_mode='auto' then
    if v_has_route then
      v_effective_state_mode := lower(
        coalesce(nullif(v_route->'metadata'->>'bootstrap_state_mode',''),'none')
      );
      if v_effective_state_mode not in ('none','summary','full') then
        v_effective_state_mode := 'none';
      end if;
    else
      v_effective_state_mode := 'summary';
    end if;
  else
    v_effective_state_mode := v_requested_state_mode;
  end if;

  if v_effective_state_mode='full' then
    v_state := public.server_gateway_build_personal_state(p_user_id,p_as_of);
  elsif v_effective_state_mode='summary' then
    v_state := jsonb_build_object(
      'schema_version','bootstrap-summary-v1',
      'as_of',p_as_of,
      'profile',(
        select jsonb_build_object('timezone',p.timezone,'locale',p.locale)
        from public.profiles p where p.id=p_user_id
      ),
      'summary',public.get_personal_state_summary(p_user_id,p_as_of)
    );
  else
    v_state := null;
  end if;

  return jsonb_build_object(
    'contract_version','bootstrap-context-v3',
    'as_of',p_as_of,
    'intent',coalesce(p_intent,''),
    'topics',v_topics,
    'state_scope',v_effective_state_mode,
    'routing',jsonb_build_object(
      'selected_route',case when v_has_route then v_route else null end,
      'candidates',coalesce(v_route_result->'matches','[]'::jsonb),
      'fast_path',v_has_route,
      'fallback_required',not v_has_route,
      'context_operation',case when v_has_route then v_route->>'context_operation' else null end,
      'context_input',case when v_has_route then coalesce(v_route->'context_input','{}'::jsonb) else '{}'::jsonb end,
      'execution_surface',case when v_has_route then v_route->>'execution_surface' else null end,
      'stable_refs',case when v_has_route then coalesce(v_route->'stable_refs','{}'::jsonb) else '{}'::jsonb end,
      'checkpoint_domains',v_checkpoint_domains,
      'db_roundtrips',1,
      'checkpoint_compact',true,
      'recommended_max_followup_calls',
        case
          when not v_has_route then 3
          when coalesce(v_route->>'context_operation','')='' then 1
          else greatest(1,least(coalesce((v_route->'metadata'->>'max_followup_calls')::int,2),3))
        end
    ),
    'specs',v_specs,
    'checkpoint',v_checkpoint,
    'state',v_state
  );
end;
$function$;

revoke all on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz,text)
  to service_role;

-- Keep the legacy five-argument overload but make it use the optimized contract.
create or replace function public.server_gateway_bootstrap_context_v2(
  p_user_id uuid,
  p_intent text default null,
  p_topics text[] default '{}'::text[],
  p_checkpoint_domains text[] default '{}'::text[],
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select public.server_gateway_bootstrap_context_v2(
    p_user_id,p_intent,p_topics,p_checkpoint_domains,p_as_of,'auto'
  )
$function$;

revoke all on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz)
  from public, anon, authenticated;
grant execute on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz)
  to service_role;

-- Preserve the established get_me_context shape while routing it through the compact fast path.
create or replace function private.get_me_context(
  p_topics text[],
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_topics text[];
  v_bootstrap jsonb;
begin
  select coalesce(
    p_user_id,
    auth.uid(),
    case
      when (select count(*) from public.profiles)=1
      then (select id from public.profiles order by created_at limit 1)
      else null
    end
  ) into v_user_id;

  select coalesce(
    array_agg(distinct lower(btrim(t))) filter (where btrim(t)<>''),
    '{}'::text[]
  )
  into v_topics
  from unnest(coalesce(p_topics,'{}'::text[])) u(t);

  if v_user_id is null then
    return jsonb_build_object(
      'context_version','v2',
      'generated_at',clock_timestamp(),
      'topics',v_topics,
      'user_id',null,
      'specs','[]'::jsonb,
      'resolved_domains',v_topics,
      'latest_checkpoint',null,
      'personal_state',null,
      'state_scope','none',
      'routing',jsonb_build_object('fast_path',false,'fallback_required',true)
    );
  end if;

  v_bootstrap := public.server_gateway_bootstrap_context_v2(
    v_user_id,
    null,
    v_topics,
    '{}'::text[],
    clock_timestamp(),
    'auto'
  );

  return jsonb_build_object(
    'context_version','v2',
    'generated_at',coalesce(v_bootstrap->'as_of',to_jsonb(clock_timestamp())),
    'topics',coalesce(v_bootstrap->'topics',to_jsonb(v_topics)),
    'user_id',v_user_id,
    'specs',coalesce(v_bootstrap->'specs','[]'::jsonb),
    'resolved_domains',coalesce(v_bootstrap->'routing'->'checkpoint_domains',to_jsonb(v_topics)),
    'latest_checkpoint',v_bootstrap->'checkpoint',
    'personal_state',v_bootstrap->'state',
    'state_scope',coalesce(v_bootstrap->'state_scope','"none"'::jsonb),
    'routing',coalesce(v_bootstrap->'routing','{}'::jsonb)
  );
end;
$function$;

revoke all on function private.get_me_context(text[],uuid) from public, anon, authenticated;
grant execute on function private.get_me_context(text[],uuid) to service_role;

create or replace function private.run_routing_fast_path_regression()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with cases(case_key,intent,topics,expected_route,expected_fallback) as (
  values
    ('meditation','start my meditation','{}'::text[],'meditation_start',false),
    ('today','what should i do now','{}'::text[],'today_now',false),
    ('health','how many steps today','{}'::text[],'health_current',false),
    ('finance','show my debt','{}'::text[],'finance_current',false),
    ('skills','practice guitar','{}'::text[],'skills_current',false),
    ('spanish','practice spanish','{}'::text[],'spanish_learning',false),
    ('todoist','show me my todoist tasks','{}'::text[],'todoist_execution',false),
    ('calendar','what is on my calendar','{}'::text[],'calendar_context',false),
    ('engineering','ENG-007','{}'::text[],'engineering_issue',false),
    ('romantic','romantic relationship course','{}'::text[],'romantic_connection_learning',false),
    ('fallback','quantum banana zzz','{}'::text[],null,true)
),
actual as (
  select
    c.*,
    public.server_gateway_resolve_intent(c.intent,c.topics,5) result
  from cases c
),
evaluated as (
  select
    case_key,
    intent,
    expected_route,
    result->'selected'->>'route_key' actual_route,
    expected_fallback,
    coalesce((result->>'fallback_required')::boolean,true) actual_fallback,
    (
      (result->'selected'->>'route_key') is not distinct from expected_route
      and coalesce((result->>'fallback_required')::boolean,true)=expected_fallback
    ) passed
  from actual
)
select jsonb_build_object(
  'contract_version','routing-fast-path-regression-v1',
  'case_count',count(*),
  'passed_count',count(*) filter(where passed),
  'failed_count',count(*) filter(where not passed),
  'passed',bool_and(passed),
  'cases',jsonb_agg(
    jsonb_build_object(
      'case_key',case_key,
      'intent',intent,
      'expected_route',expected_route,
      'actual_route',actual_route,
      'expected_fallback',expected_fallback,
      'actual_fallback',actual_fallback,
      'passed',passed
    )
    order by case_key
  )
)
from evaluated
$function$;

revoke all on function private.run_routing_fast_path_regression() from public, anon, authenticated;
grant execute on function private.run_routing_fast_path_regression() to service_role;
