
create or replace function public.server_gateway_resolve_intent(
  p_intent text,
  p_topics text[] default '{}'::text[],
  p_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with
input as (
  select
    lower(regexp_replace(btrim(coalesce(p_intent,'')), '\\s+', ' ', 'g')) as intent,
    coalesce(
      array(
        select distinct lower(regexp_replace(btrim(t), '\\s+', ' ', 'g'))
        from unnest(coalesce(p_topics,'{}'::text[])) as u(t)
        where btrim(t) <> ''
      ),
      '{}'::text[]
    ) as topics,
    greatest(1,least(coalesce(p_limit,5),10)) as result_limit
),
ranked as (
  select
    r.*,
    best.match_score,
    best.match_kind
  from private.intent_routing_registry r
  cross join input i
  cross join lateral (
    select m.match_score,m.match_kind
    from (
      select 1200::integer as match_score, 'route_key_exact'::text as match_kind
      where i.intent <> '' and lower(r.route_key)=i.intent

      union all

      select (1100 + least(length(a),49))::integer, 'alias_exact'
      from unnest(r.aliases) a
      where i.intent <> '' and lower(btrim(a))=i.intent

      union all

      -- Multiple matching topics are stronger evidence than a single generic topic.
      select (
        1000
        + least(count(*)::integer * 20,60)
        + least(coalesce(sum(length(btrim(t))),0)::integer,29)
      )::integer,
      'topic_set'
      from unnest(r.topics) t
      where lower(btrim(t)) = any(i.topics)
      having count(*) >= 2

      union all

      select (900 + least(length(t),49))::integer, 'topic_exact'
      from unnest(r.topics) t
      where lower(btrim(t)) = any(i.topics)

      union all

      select (700 + least(length(a),99))::integer, 'alias_phrase'
      from unnest(r.aliases) a
      where i.intent <> ''
        and length(btrim(a)) >= 3
        and position(lower(btrim(a)) in i.intent) > 0

      union all

      select (650 + least(length(t),99))::integer, 'topic_phrase'
      from unnest(r.topics) t
      where i.intent <> ''
        and length(btrim(t)) >= 3
        and position(lower(btrim(t)) in i.intent) > 0
    ) m
    order by m.match_score desc,m.match_kind
    limit 1
  ) best
  where r.status='active'
),
limited as (
  select *
  from ranked
  order by match_score desc,priority asc,route_key asc
  limit (select result_limit from input)
),
matches as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'route_key',route_key,
        'aliases',aliases,
        'topics',topics,
        'spec_keys',spec_keys,
        'checkpoint_domains',checkpoint_domains,
        'context_operation',context_operation,
        'context_input',context_input,
        'execution_surface',execution_surface,
        'stable_refs',stable_refs,
        'priority',priority,
        'route_version',route_version,
        'metadata',metadata,
        'match_score',match_score,
        'match_kind',match_kind
      )
      order by match_score desc,priority asc,route_key asc
    ),
    '[]'::jsonb
  ) value
  from limited
)
select jsonb_build_object(
  'intent',(select intent from input),
  'topics',(select topics from input),
  'selected',coalesce((select value->0 from matches),'null'::jsonb),
  'matches',(select value from matches),
  'fallback_required',jsonb_array_length((select value from matches))=0
)
$function$;

revoke all on function public.server_gateway_resolve_intent(text,text[],integer)
  from public, anon, authenticated;
grant execute on function public.server_gateway_resolve_intent(text,text[],integer)
  to service_role;

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
    ('engineering_topics','',array['engineering','routing','performance','latency','context','intelligence']::text[],'engineering_issue',false),
    ('romantic','romantic relationship course','{}'::text[],'romantic_connection_learning',false),
    ('fallback','quantum banana zzz','{}'::text[],null,true)
),
actual as (
  select c.*, public.server_gateway_resolve_intent(c.intent,c.topics,5) result
  from cases c
),
evaluated as (
  select
    case_key,
    intent,
    topics,
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
  'contract_version','routing-fast-path-regression-v2',
  'case_count',count(*),
  'passed_count',count(*) filter(where passed),
  'failed_count',count(*) filter(where not passed),
  'passed',bool_and(passed),
  'cases',jsonb_agg(
    jsonb_build_object(
      'case_key',case_key,
      'intent',intent,
      'topics',topics,
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
