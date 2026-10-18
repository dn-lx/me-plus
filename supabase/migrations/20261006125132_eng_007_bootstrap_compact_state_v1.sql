-- ENG-007 follow-up: compact bootstrap state for known routes.
-- Keep the 5-argument v2 function for compatibility; the gateway uses this 6-argument overload.

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
  v_state_mode text := lower(btrim(coalesce(p_state_mode,'auto')));
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode='22023';
  end if;
  if v_state_mode not in ('auto','summary','full') then
    raise exception 'invalid_state_mode' using errcode='22023';
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

  if v_state_mode='full'
     or (v_state_mode='auto' and (v_route is null or jsonb_typeof(v_route)<>'object')) then
    v_state_mode := 'full';
    v_state := public.server_gateway_build_personal_state(p_user_id,p_as_of);
  else
    v_state_mode := 'summary';
    v_state := jsonb_build_object(
      'schema_version','bootstrap-summary-v1',
      'as_of',p_as_of,
      'profile',(
        select jsonb_build_object('timezone',p.timezone,'locale',p.locale)
        from public.profiles p where p.id=p_user_id
      ),
      'summary',public.get_personal_state_summary(p_user_id,p_as_of)
    );
  end if;

  return jsonb_build_object(
    'contract_version','bootstrap-context-v2',
    'as_of',p_as_of,
    'intent',coalesce(p_intent,''),
    'topics',v_topics,
    'state_scope',v_state_mode,
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

revoke all on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz,text)
  to service_role;

comment on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz,text) is
  'Service-only one-roundtrip Me+ bootstrap. Known routes default to compact Personal State summary; unknown routes may fall back to full state. p_state_mode supports auto|summary|full.';
