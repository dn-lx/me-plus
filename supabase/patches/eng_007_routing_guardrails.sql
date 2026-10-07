-- ENG-007: reviewed patch candidate, NOT an automatically applied migration.
-- Generate a new migration with `supabase migration new eng_007_routing_guardrails`
-- and copy this file into it only during the approved promotion workflow.
-- Compatible with existing bootstrap v2/v3 callers; no user-data writes.
create or replace function private.normalize_meplus_route_text(p_text text)
returns text language sql immutable parallel safe set search_path = ''
as $$ select lower(btrim(regexp_replace(coalesce(p_text,''),'[[:space:]]+',' ','g'))) $$;
create or replace function private.meplus_route_phrase_present(p_text text,p_phrase text)
returns boolean language sql immutable parallel safe set search_path = ''
as $$
 select length(btrim(regexp_replace(coalesce(p_phrase,''),'[^[:alnum:]]+',' ','g'))) >= 3
 and strpos(' '||btrim(regexp_replace(private.normalize_meplus_route_text(p_text),'[^[:alnum:]]+',' ','g'))||' ',
 ' '||btrim(regexp_replace(private.normalize_meplus_route_text(p_phrase),'[^[:alnum:]]+',' ','g'))||' ')>0
$$;
create or replace function private.check_meplus_route_specs(p_keys text[],p_as_of timestamptz default statement_timestamp())
returns jsonb language sql stable set search_path = ''
as $$
with expected as (select distinct k from unnest(coalesce(p_keys,'{}'::text[])) u(k)), checked as (
 select e.k spec_key,
 case when s.spec_key is null then 'missing_registration'
 when s.status is distinct from 'active' then 'inactive_registration'
 when coalesce(btrim(s.drive_file_id),'')='' or left(coalesce(s.drive_url,''),length('https://docs.google.com/document/d/'||s.drive_file_id||'/')) <> 'https://docs.google.com/document/d/'||s.drive_file_id||'/' then 'invalid_reference'
 when s.last_verified_at is null or s.last_verified_at<p_as_of-interval '30 days' then 'needs_revalidation'
 else 'ready' end status,s.drive_file_id,s.last_verified_at
 from expected e left join private.spec_registry s on s.spec_key=e.k
)
select jsonb_build_object('ready',count(*)>0 and coalesce(bool_and(status='ready'),false),
 'status',case when count(*)=0 then 'missing_spec_route' when bool_and(status='ready') then 'ready'
 when bool_or(status in ('missing_registration','inactive_registration','invalid_reference')) then 'broken_registration' else 'needs_revalidation' end,
 'issues',coalesce(jsonb_agg(jsonb_build_object('spec_key',spec_key,'status',status,'drive_file_id',drive_file_id,'last_verified_at',last_verified_at) order by spec_key) filter(where status<>'ready'),'[]'::jsonb),
 'verification_scope','registry_only_not_remote_connector','revalidation_after_days',30) from checked
$$;
create or replace function public.server_gateway_resolve_intent(p_intent text,p_topics text[] default '{}'::text[],p_limit integer default 5)
returns jsonb language plpgsql stable security definer set search_path = ''
as $fn$
declare
 v_intent text:=private.normalize_meplus_route_text(p_intent);
 v_topics text[]; v_matches jsonb; v_top jsonb; v_selected jsonb;
 v_ambiguous boolean:=false; v_reason text; v_issue text[];
begin
 if length(coalesce(p_intent,''))>2000 or coalesce(cardinality(p_topics),0)>20
 or exists(select 1 from unnest(coalesce(p_topics,'{}'::text[])) t where length(t)>200) then
 raise exception 'routing_input_too_large' using errcode='22023'; end if;
 select coalesce(array_agg(distinct private.normalize_meplus_route_text(t)) filter(where private.normalize_meplus_route_text(t)<>''),'{}'::text[])
 into v_topics from unnest(coalesce(p_topics,'{}'::text[])) t;
 with ranked as (
 select r.*,best.score,best.kind from private.intent_routing_registry r
 cross join lateral (
 select m.score,m.kind from (
 select 3000 score,'route_key_exact' kind where v_intent<>'' and private.normalize_meplus_route_text(r.route_key)=v_intent
 union all select 2800+least(length(a),99),'alias_exact' from unnest(r.aliases) a where v_intent<>'' and private.normalize_meplus_route_text(a)=v_intent
 union all
 -- Explicit language outranks broad caller-supplied topic hints.
 select (case when private.normalize_meplus_route_text(a) like '% %' then 2400 else 2000 end)+least(length(a),99),'alias_phrase'
 from unnest(r.aliases) a where v_intent<>'' and private.meplus_route_phrase_present(v_intent,a)
 and not(private.normalize_meplus_route_text(a)='models' and r.route_key='romantic_connection_learning')
 union all select 1800+least(length(t),99),'topic_phrase' from unnest(r.topics) t where v_intent<>'' and private.meplus_route_phrase_present(v_intent,t)
 union all select 1400+least(count(distinct private.normalize_meplus_route_text(t))::int*20,60),'topic_set'
 from unnest(r.topics) t where private.normalize_meplus_route_text(t)=any(v_topics) having count(distinct private.normalize_meplus_route_text(t))>=2
 union all select 1200+least(length(t),99),'topic_exact' from unnest(r.topics) t where private.normalize_meplus_route_text(t)=any(v_topics)
 ) m order by m.score desc,m.kind limit 1
 ) best where r.status='active'
 ), limited as (
 select * from ranked order by score desc,priority,route_key
 -- Evaluate two candidates even when the caller requests one.
 limit greatest(2,least(coalesce(p_limit,5),10))
 )
 select coalesce(jsonb_agg(jsonb_build_object('route_key',route_key,'topics',topics,'spec_keys',spec_keys,
 'checkpoint_domains',checkpoint_domains,'context_operation',context_operation,'context_input',context_input,
 'execution_surface',execution_surface,'stable_refs',stable_refs,'priority',priority,'route_version',route_version,
 'metadata',metadata,'match_score',score,'match_kind',kind,'registration',private.check_meplus_route_specs(spec_keys))
 order by score desc,priority,route_key),'[]'::jsonb) into v_matches from limited;
 v_top:=v_matches->0;
 v_ambiguous:=jsonb_array_length(v_matches)>1 and (v_top->>'match_kind') in ('alias_phrase','topic_phrase')
 and (v_matches->1->>'match_kind') in ('alias_phrase','topic_phrase')
 and abs((v_top->>'match_score')::int-(v_matches->1->>'match_score')::int)<=15;
 if v_top is null then v_reason:='unknown_intent';
 elsif v_ambiguous then v_reason:='multiple_matching_intents';
 elsif not coalesce((v_top->'registration'->>'ready')::boolean,false) then v_reason:=v_top->'registration'->>'status';
 else
 v_selected:=v_top;
 -- An explicit issue identifier avoids a broad issue-list follow-up.
 v_issue:=regexp_match(upper(coalesce(p_intent,'')),'(^|[^A-Z0-9])([A-Z]+-[0-9]{3})([^A-Z0-9]|$)');
 if v_selected->>'route_key'='engineering_issue' and v_issue is not null then
 v_selected:=v_selected||jsonb_build_object('context_operation','get_engineering_issue',
 'context_input',jsonb_build_object('issue_key',v_issue[2]),
 'stable_refs',coalesce(v_selected->'stable_refs','{}'::jsonb)||jsonb_build_object('issue_key',v_issue[2])); end if;
 end if;
 -- Only the selected route carries full execution context; alternatives are summaries.
 return jsonb_build_object('contract_version','intent-routing-v3','intent',v_intent,'topics',v_topics,'selected',v_selected,
 'matches',coalesce((select jsonb_agg(jsonb_build_object('route_key',x->'route_key','match_score',x->'match_score',
 'match_kind',x->'match_kind','spec_keys',x->'spec_keys','registration',x->'registration') order by ord)
 from jsonb_array_elements(v_matches) with ordinality u(x,ord)
 where ord<=greatest(case when v_ambiguous then 2 else 1 end,least(coalesce(p_limit,5),10))),'[]'::jsonb),
 'fallback_required',v_selected is null,'fallback_reason',v_reason,
 'fallback_policy',jsonb_build_object('max_discovery_calls',2,
 'order',jsonb_build_array('exact_registered_reference','one_scoped_lookup','report_blocker'),
 'multiple_intents','select_or_split_existing_candidates_without_broad_discovery',
 'auth_failure','stop_and_report_no_permission_bypass','transient_read_failure','at_most_one_repeat_safe_retry',
 'mutation_failure','reconcile_before_retry','remote_access_verified',false));
end
$fn$;
revoke all on function private.normalize_meplus_route_text(text) from public,anon,authenticated;
revoke all on function private.meplus_route_phrase_present(text,text) from public,anon,authenticated;
revoke all on function private.check_meplus_route_specs(text[],timestamptz) from public,anon,authenticated;
revoke all on function public.server_gateway_resolve_intent(text,text[],integer) from public,anon,authenticated;
grant execute on function private.normalize_meplus_route_text(text) to service_role;
grant execute on function private.meplus_route_phrase_present(text,text) to service_role;
grant execute on function private.check_meplus_route_specs(text[],timestamptz) to service_role;
grant execute on function public.server_gateway_resolve_intent(text,text[],integer) to service_role;

-- Preserve the live bootstrap-context-v3 contract while forwarding bounded fallback diagnostics.
CREATE OR REPLACE FUNCTION public.server_gateway_bootstrap_context_v2(p_user_id uuid, p_intent text DEFAULT NULL::text, p_topics text[] DEFAULT '{}'::text[], p_checkpoint_domains text[] DEFAULT '{}'::text[], p_as_of timestamp with time zone DEFAULT clock_timestamp(), p_state_mode text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_route_result jsonb;
  v_route jsonb;
  v_candidate jsonb;
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
  v_candidate := v_route_result->'matches'->0;
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
  elsif v_candidate is not null
        and jsonb_typeof(v_candidate)='object'
        and coalesce(v_route_result->>'fallback_reason','') in ('broken_registration','needs_revalidation') then
    -- Keep a broken/stale route scoped to its registered specs instead of broad discovery.
    select coalesce(array_agg(distinct btrim(x)) filter (where btrim(x)<>''),'{}'::text[])
      into v_spec_keys
      from jsonb_array_elements_text(coalesce(v_candidate->'spec_keys','[]'::jsonb)) x;
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
      'fallback_required',coalesce((v_route_result->>'fallback_required')::boolean,not v_has_route),
      'fallback_reason',case when v_has_route then null else v_route_result->>'fallback_reason' end,
      'fallback_policy',coalesce(v_route_result->'fallback_policy','{}'::jsonb),
      'resolver_contract_version',v_route_result->>'contract_version',
      'context_operation',case when v_has_route then v_route->>'context_operation' else null end,
      'context_input',case when v_has_route then coalesce(v_route->'context_input','{}'::jsonb) else '{}'::jsonb end,
      'execution_surface',case when v_has_route then v_route->>'execution_surface' else null end,
      'stable_refs',case when v_has_route then coalesce(v_route->'stable_refs','{}'::jsonb) else '{}'::jsonb end,
      'checkpoint_domains',v_checkpoint_domains,
      'db_roundtrips',1,
      'checkpoint_compact',true,
      'recommended_max_followup_calls',
        case
          when not v_has_route then greatest(1,least(coalesce((v_route_result->'fallback_policy'->>'max_discovery_calls')::int,2),2))
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

revoke all on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz,text) from public, anon, authenticated;
grant execute on function public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz,text) to service_role;
