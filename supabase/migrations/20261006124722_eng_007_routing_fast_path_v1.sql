-- ENG-007: canonical intent routing and one-roundtrip bootstrap context.
-- Additive/private configuration only; existing gateway v1 operations remain compatible.

create table if not exists private.intent_routing_registry (
  route_key text primary key
    check (route_key ~ '^[a-z0-9][a-z0-9_.-]*$'),
  aliases text[] not null default '{}'::text[],
  topics text[] not null default '{}'::text[],
  spec_keys text[] not null default '{}'::text[],
  checkpoint_domains text[] not null default '{}'::text[],
  context_operation text,
  context_input jsonb not null default '{}'::jsonb
    check (jsonb_typeof(context_input) = 'object'),
  execution_surface text,
  stable_refs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(stable_refs) = 'object'),
  priority smallint not null default 100
    check (priority between 1 and 1000),
  status text not null default 'active'
    check (status in ('active','inactive')),
  route_version text not null default '1.0',
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table private.intent_routing_registry enable row level security;

revoke all on table private.intent_routing_registry from public;
revoke all on table private.intent_routing_registry from anon;
revoke all on table private.intent_routing_registry from authenticated;

create index if not exists intent_routing_registry_status_priority_idx
  on private.intent_routing_registry(status, priority, route_key);
create index if not exists intent_routing_registry_aliases_gin
  on private.intent_routing_registry using gin(aliases);
create index if not exists intent_routing_registry_topics_gin
  on private.intent_routing_registry using gin(topics);

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
as $$
with
input as (
  select
    lower(regexp_replace(btrim(coalesce(p_intent,'')), '\s+', ' ', 'g')) as intent,
    coalesce(
      array(
        select distinct lower(regexp_replace(btrim(t), '\s+', ' ', 'g'))
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
      select 1000::integer as match_score, 'route_key_exact'::text as match_kind
      where i.intent <> '' and lower(r.route_key)=i.intent

      union all

      select (950 + least(length(a),49))::integer, 'alias_exact'
      from unnest(r.aliases) a
      where i.intent <> '' and lower(btrim(a))=i.intent

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
);
$$;

revoke all on function public.server_gateway_resolve_intent(text,text[],integer)
  from public, anon, authenticated;
grant execute on function public.server_gateway_resolve_intent(text,text[],integer)
  to service_role;

create or replace function public.server_gateway_bootstrap_context_v2(
  p_user_id uuid,
  p_intent text default null,
  p_topics text[] default '{}'::text[],
  p_checkpoint_domains text[] default '{}'::text[],
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_route_result jsonb;
  v_route jsonb;
  v_route_topics text[] := '{}'::text[];
  v_spec_keys text[] := '{}'::text[];
  v_checkpoint_domains text[] := '{}'::text[];
  v_topics text[] := '{}'::text[];
  v_specs jsonb := '[]'::jsonb;
  v_checkpoint jsonb;
  v_state jsonb;
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode='22023';
  end if;

  v_route_result := public.server_gateway_resolve_intent(p_intent,p_topics,5);
  v_route := v_route_result->'selected';

  if v_route is not null and jsonb_typeof(v_route)='object' then
    select coalesce(array_agg(distinct lower(btrim(x))) filter (where btrim(x)<>''),'{}'::text[])
      into v_route_topics
      from jsonb_array_elements_text(coalesce(v_route->'topics','[]'::jsonb)) x;

    select coalesce(array_agg(distinct btrim(x)) filter (where btrim(x)<>''),'{}'::text[])
      into v_spec_keys
      from jsonb_array_elements_text(coalesce(v_route->'spec_keys','[]'::jsonb)) x;

    select coalesce(array_agg(distinct lower(btrim(x))) filter (where btrim(x)<>''),'{}'::text[])
      into v_checkpoint_domains
      from jsonb_array_elements_text(coalesce(v_route->'checkpoint_domains','[]'::jsonb)) x;
  end if;

  select coalesce(array_agg(distinct x) filter (where x<>''),'{}'::text[])
    into v_topics
  from (
    select lower(btrim(t)) x from unnest(coalesce(p_topics,'{}'::text[])) t
    union all
    select unnest(v_route_topics)
  ) q;

  select coalesce(array_agg(distinct x) filter (where x<>''),'{}'::text[])
    into v_checkpoint_domains
  from (
    select lower(btrim(t)) x from unnest(coalesce(p_checkpoint_domains,'{}'::text[])) t
    union all
    select unnest(v_checkpoint_domains)
    union all
    select unnest(v_topics)
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

  v_checkpoint := public.server_gateway_get_latest_checkpoint(p_user_id,v_checkpoint_domains);
  v_state := public.server_gateway_build_personal_state(p_user_id,p_as_of);

  return jsonb_build_object(
    'contract_version','bootstrap-context-v2',
    'as_of',p_as_of,
    'intent',coalesce(p_intent,''),
    'topics',v_topics,
    'routing',jsonb_build_object(
      'selected_route',v_route,
      'candidates',coalesce(v_route_result->'matches','[]'::jsonb),
      'fast_path',v_route is not null and jsonb_typeof(v_route)='object',
      'fallback_required',coalesce((v_route_result->>'fallback_required')::boolean,true),
      'context_operation',case when jsonb_typeof(v_route)='object' then v_route->>'context_operation' else null end,
      'context_input',case when jsonb_typeof(v_route)='object' then coalesce(v_route->'context_input','{}'::jsonb) else '{}'::jsonb end,
      'execution_surface',case when jsonb_typeof(v_route)='object' then v_route->>'execution_surface' else null end,
      'stable_refs',case when jsonb_typeof(v_route)='object' then coalesce(v_route->'stable_refs','{}'::jsonb) else '{}'::jsonb end,
      'db_roundtrips',1,
      'recommended_max_followup_calls',case when v_route is null then 3 else 2 end
    ),
    'specs',v_specs,
    'checkpoint',v_checkpoint,
    'state',v_state
  );
end;
$$;

revoke all on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz)
  from public, anon, authenticated;
grant execute on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz)
  to service_role;

comment on table private.intent_routing_registry is
  'ENG-007 machine-readable fast-path registry from common Me+ intents/aliases to canonical specs, bounded context operations and execution surfaces.';
comment on function public.server_gateway_resolve_intent(text,text[],integer) is
  'Service-only deterministic fast-path intent resolver. Unknown intents return fallback_required=true rather than broadening access.';
comment on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz) is
  'Service-only one-roundtrip Me+ bootstrap: deterministic intent route, canonical specs, latest relevant checkpoint and bounded Personal State.';

insert into private.intent_routing_registry(
  route_key,aliases,topics,spec_keys,checkpoint_domains,
  context_operation,context_input,execution_surface,stable_refs,
  priority,status,route_version,metadata
)
values
('today_now',
 array['what should i do now','what should i do today','today plan','today','my day','next action'],
 array['today','daily','actions','routines'],
 array['daily_action_engine','intelligence_contract'],
 array['today','daily','actions','routines','scheduler'],
 'today','{}'::jsonb,'me-plus-gateway','{"surface":"today"}'::jsonb,
 10,'active','1.0','{"max_followup_calls":2}'::jsonb),

('current_guidance',
 array['guidance','me+ guidance','current guidance','what do you recommend','recommendation'],
 array['guidance','recommendations','intelligence'],
 array['intelligence_contract','scheduler_automation'],
 array['guidance','recommendations','scheduler'],
 'get_current_guidance','{}'::jsonb,'me-plus-gateway','{"surface":"guidance"}'::jsonb,
 12,'active','1.0','{"max_followup_calls":2}'::jsonb),

('health_current',
 array['health','health status','steps','steps today','how many steps','sleep','recovery','heart rate','hrv'],
 array['health','steps','sleep','recovery'],
 array['data_foundation','intelligence_contract'],
 array['health','steps','sleep','recovery'],
 'get_health_context','{}'::jsonb,'me-plus-gateway','{}'::jsonb,
 20,'active','1.0','{"max_followup_calls":2}'::jsonb),

('finance_current',
 array['finance','financial','money','bank','n26','debt','debts','budget','spending'],
 array['finance','money','debt','banking'],
 array['data_foundation','intelligence_contract'],
 array['finance','banking','debt'],
 'get_finance_context','{}'::jsonb,'me-plus-gateway','{}'::jsonb,
 20,'active','1.0','{"max_followup_calls":2}'::jsonb),

('nutrition_current',
 array['nutrition','food','meal','meals','protein','calories','hydration','water'],
 array['nutrition','food','hydration'],
 array['data_foundation','intelligence_contract'],
 array['nutrition','hydration','health'],
 'get_nutrition_context','{}'::jsonb,'me-plus-gateway','{}'::jsonb,
 21,'active','1.0','{"max_followup_calls":2}'::jsonb),

('training_current',
 array['training','workout','workouts','gym','exercise','fitness'],
 array['fitness','training','workout'],
 array['data_foundation','intelligence_contract'],
 array['fitness','training','health'],
 'get_training_context','{}'::jsonb,'me-plus-gateway','{}'::jsonb,
 22,'active','1.0','{"max_followup_calls":2}'::jsonb),

('routines_due',
 array['routine','routines','due routines','morning routine','evening routine'],
 array['routines','daily'],
 array['daily_action_engine','intelligence_contract'],
 array['routines','daily','actions'],
 'get_context','{"topics":["routines"]}'::jsonb,'me-plus-gateway','{}'::jsonb,
 25,'active','1.0','{"max_followup_calls":2}'::jsonb),

('calendar_context',
 array['calendar','schedule','appointments','events','availability'],
 array['calendar','schedule'],
 array['daily_action_engine','intelligence_contract'],
 array['calendar','daily'],
 'get_calendar_context','{}'::jsonb,'google-calendar','{}'::jsonb,
 25,'active','1.0','{"max_followup_calls":2}'::jsonb),

('todoist_execution',
 array['todoist','tasks','task list','me+ tasks'],
 array['todoist','actions','tasks'],
 array['daily_action_engine','scheduler_automation'],
 array['todoist','actions','scheduler'],
 'get_context','{"topics":["actions"]}'::jsonb,'todoist','{}'::jsonb,
 25,'active','1.0','{"max_followup_calls":2}'::jsonb),

('meditation_start',
 array['meditation','start my meditation','guided meditation','six phase meditation','6 phase meditation','evening meditation','short meditation'],
 array['meditation','spirituality'],
 array['meditation_six_phase'],
 array['meditation','spirituality','preferences'],
 'get_settings_context','{}'::jsonb,'chatgpt','{"spec_key":"meditation_six_phase"}'::jsonb,
 10,'active','1.0','{"max_followup_calls":2}'::jsonb),

('spanish_learning',
 array['spanish','spanish lesson','practice spanish','learn spanish','spanish course'],
 array['spanish','language','learning'],
 array['spanish_learning'],
 array['spanish','learning'],
 'get_spanish_context','{"language_code":"es"}'::jsonb,'chatgpt','{"language_code":"es"}'::jsonb,
 10,'active','1.0','{"max_followup_calls":2}'::jsonb),

('romantic_connection_learning',
 array['romantic relationships','romantic relationship','romantic connection','relationship course','dating course','anxiously attached','models','how to not die alone'],
 array['romantic relationships','romantic connection','relationship learning','dating','attachment'],
 array['romantic_connection_learning'],
 array['relationships_social','romantic relationships','learning'],
 'get_learning_context','{"course_key":"romantic_connection_integrated"}'::jsonb,'chatgpt',
 '{"course_key":"romantic_connection_integrated"}'::jsonb,
 8,'active','1.0','{"max_followup_calls":2}'::jsonb),

('art_of_seduction_learning',
 array['art of seduction','the art of seduction','seductive process','seduction course'],
 array['art of seduction','seduction learning'],
 array['seduction_learning'],
 array['relationships','skills','art_of_seduction'],
 'get_learning_context','{"course_key":"art_of_seduction_complete"}'::jsonb,'chatgpt',
 '{"course_key":"art_of_seduction_complete"}'::jsonb,
 9,'active','1.0','{"max_followup_calls":2}'::jsonb),

('skills_current',
 array['skills','skill','guitar','singing','bachata','salsa','dance','dancing'],
 array['skills','learning'],
 array['data_foundation','intelligence_contract'],
 array['skills','learning'],
 'get_skills_context','{}'::jsonb,'me-plus-gateway','{}'::jsonb,
 30,'active','1.0','{"max_followup_calls":2}'::jsonb),

('scheduler_runtime',
 array['scheduler','automation','watchdog','runtime health'],
 array['scheduler','automation','runtime'],
 array['scheduler_automation'],
 array['scheduler','automation','runtime_health','watchdog'],
 null,'{}'::jsonb,'me-plus-backend','{}'::jsonb,
 30,'active','1.0','{"max_followup_calls":2}'::jsonb),

('engineering_issue',
 array['engineering issue','engineering issues','eng-007','eng-'],
 array['engineering','architecture','routing','performance'],
 array['master_blueprint','supabase_schema'],
 array['engineering','routing','performance','security'],
 'list_engineering_issues','{}'::jsonb,'me-plus-gateway','{}'::jsonb,
 15,'active','1.0','{"max_followup_calls":2}'::jsonb),

('meplus_architecture',
 array['me+ architecture','me plus architecture','me+ system','me plus system','architecture'],
 array['architecture','system','integration'],
 array['master_blueprint','intelligence_contract','supabase_schema'],
 array['architecture','engineering','routing'],
 null,'{}'::jsonb,'chatgpt','{}'::jsonb,
 40,'active','1.0','{"max_followup_calls":2}'::jsonb)
on conflict (route_key) do update set
  aliases=excluded.aliases,
  topics=excluded.topics,
  spec_keys=excluded.spec_keys,
  checkpoint_domains=excluded.checkpoint_domains,
  context_operation=excluded.context_operation,
  context_input=excluded.context_input,
  execution_surface=excluded.execution_surface,
  stable_refs=excluded.stable_refs,
  priority=excluded.priority,
  status=excluded.status,
  route_version=excluded.route_version,
  metadata=excluded.metadata,
  updated_at=clock_timestamp();
