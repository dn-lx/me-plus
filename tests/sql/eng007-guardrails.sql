-- Behavioral tests on disposable PostgreSQL. No live credentials or personal rows.
begin;
create temporary table results(name text primary key,passed boolean not null);
create function pg_temp.check_it(p_name text,p_ok boolean) returns void language plpgsql as $$
begin
 if p_ok is distinct from true then raise exception 'ENG-007 assertion failed: %',p_name; end if;
 insert into results values(p_name,true);
end $$;
with cases(name,intent,topics,expected) as (values
('meditation','start my meditation','{}'::text[],'meditation_start'),
('today','what should i do now','{}','today_now'),
('steps','how many steps today','{}','health_current'),
('finance','show my debt','{}','finance_current'),
('skills','practice guitar','{}','skills_current'),
('spanish','practice spanish','{}','spanish_learning'),
('todoist','show me my todoist tasks','{}','todoist_execution'),
('calendar','what is on my calendar','{}','calendar_context'),
('engineering','ENG-007','{}','engineering_issue'),
('engineering topics','',array['engineering','routing','performance','intelligence'],'engineering_issue'),
('romantic','romantic relationship course','{}','romantic_connection_learning'),
('seduction','the art of seduction','{}','art_of_seduction_learning'),
('guidance','guidance','{}','current_guidance'),
('routine','evening routine','{}','routines_due'),
('nutrition','protein','{}','nutrition_current'),
('workout','workout','{}','training_current'),
('scheduler','watchdog','{}','scheduler_runtime'),
('architecture','me+ architecture','{}','meplus_architecture'),
('steps beats broad topic','how many steps today',array['daily'],'health_current'),
('spanish beats generic topic','practice spanish',array['learning','intelligence'],'spanish_learning'),
('whitespace','start'||chr(9)||'my'||chr(10)||'meditation','{}','meditation_start'),
('punctuation','How many steps today?','{}','health_current'),
('case','PRACTICE SPANISH','{}','spanish_learning'),
('explicit stable route','meditation_start','{}','meditation_start'),
('book exact','models','{}','romantic_connection_learning')
)
select pg_temp.check_it(name,public.server_gateway_resolve_intent(intent,topics,5)->'selected'->>'route_key'=expected) from cases;
select pg_temp.check_it('normalized whitespace',private.normalize_meplus_route_text('  START'||chr(9)||'MY'||chr(10)||'meditation  ')='start my meditation');
select pg_temp.check_it('word boundary',public.server_gateway_resolve_intent('dancehallxyz')->>'fallback_reason'='unknown_intent');
select pg_temp.check_it('substring task rejection',public.server_gateway_resolve_intent('multitaskerxyz')->>'fallback_reason'='unknown_intent');
select pg_temp.check_it('unknown',public.server_gateway_resolve_intent('quantum banana zzz')->>'fallback_reason'='unknown_intent');
select pg_temp.check_it('empty',public.server_gateway_resolve_intent(null)->>'fallback_reason'='unknown_intent');
select pg_temp.check_it('generic model mention',public.server_gateway_resolve_intent('compare large models')->>'fallback_reason'='unknown_intent');
select pg_temp.check_it('multiple intents',public.server_gateway_resolve_intent('show my calendar and bank balance')->>'fallback_reason'='multiple_matching_intents');
select pg_temp.check_it('ambiguity despite result limit',(public.server_gateway_resolve_intent('show my calendar and bank balance','{}',1)->>'fallback_required')::boolean);
select pg_temp.check_it('two ambiguity options',jsonb_array_length(public.server_gateway_resolve_intent('show my calendar and bank balance','{}',1)->'matches')=2);
select pg_temp.check_it('direct issue operation',public.server_gateway_resolve_intent('fix ENG-007')->'selected'->>'context_operation'='get_engineering_issue');
select pg_temp.check_it('direct issue key',public.server_gateway_resolve_intent('fix ENG-007')->'selected'->'context_input'->>'issue_key'='ENG-007');
select pg_temp.check_it('no arbitrary issue prefix',public.server_gateway_resolve_intent('engineering issue ENG-0070')->'selected'->>'context_operation'='list_engineering_issues');
select pg_temp.check_it('no alias duplication',not(public.server_gateway_resolve_intent('meditation')->'matches'->0 ? 'aliases'));
select pg_temp.check_it('candidate cap',jsonb_array_length(public.server_gateway_resolve_intent('','{learning,intelligence,architecture,daily,health,finance}',100)->'matches')<=10);
select pg_temp.check_it('no remote verification claim',public.server_gateway_resolve_intent('meditation')->'selected'->'registration'->>'verification_scope'='registry_only_not_remote_connector');
select pg_temp.check_it('auth failure stops',public.server_gateway_resolve_intent('meditation')->'fallback_policy'->>'auth_failure'='stop_and_report_no_permission_bypass');
select pg_temp.check_it('safe mutation retry contract',public.server_gateway_resolve_intent('meditation')->'fallback_policy'->>'mutation_failure'='reconcile_before_retry');
select pg_temp.check_it('known bootstrap stays state-free',public.server_gateway_bootstrap_context_v2('00000000-0000-0000-0000-000000000001'::uuid,'meditation','{}','{}',statement_timestamp(),'auto')->>'state_scope'='none');
select pg_temp.check_it('known bootstrap stays fast',not (public.server_gateway_bootstrap_context_v2('00000000-0000-0000-0000-000000000001'::uuid,'meditation','{}','{}',statement_timestamp(),'auto')->'routing'->>'fallback_required')::boolean);
select pg_temp.check_it('bootstrap exposes resolver contract',public.server_gateway_bootstrap_context_v2('00000000-0000-0000-0000-000000000001'::uuid,'meditation','{}','{}',statement_timestamp(),'auto')->'routing'->>'resolver_contract_version'='intent-routing-v3');
select pg_temp.check_it('ambiguous bootstrap keeps reason',public.server_gateway_bootstrap_context_v2('00000000-0000-0000-0000-000000000001'::uuid,'show my calendar and bank balance','{}','{}',statement_timestamp(),'auto')->'routing'->>'fallback_reason'='multiple_matching_intents');
select pg_temp.check_it('fallback discovery remains bounded',(public.server_gateway_bootstrap_context_v2('00000000-0000-0000-0000-000000000001'::uuid,'quantum banana zzz','{}','{}',statement_timestamp(),'auto')->'routing'->>'recommended_max_followup_calls')::int<=2);
update private.spec_registry set status='inactive' where spec_key='meditation_six_phase';
select pg_temp.check_it('inactive spec blocks fast path',public.server_gateway_resolve_intent('meditation')->>'fallback_reason'='broken_registration');
select pg_temp.check_it('inactive bootstrap keeps reason',public.server_gateway_bootstrap_context_v2('00000000-0000-0000-0000-000000000001'::uuid,'meditation','{}','{}',statement_timestamp(),'auto')->'routing'->>'fallback_reason'='broken_registration');
update private.spec_registry set status='active',drive_url='https://example.invalid/not-a-canonical-spec' where spec_key='meditation_six_phase';
select pg_temp.check_it('bad reference blocks fast path',public.server_gateway_resolve_intent('meditation')->>'fallback_reason'='broken_registration');
update private.spec_registry set drive_url='https://docs.google.com/document/d/'||drive_file_id||'/edit',last_verified_at=statement_timestamp()-interval '31 days' where spec_key='meditation_six_phase';
select pg_temp.check_it('stale asks revalidation',public.server_gateway_resolve_intent('meditation')->>'fallback_reason'='needs_revalidation');
select pg_temp.check_it('stale bootstrap keeps exact spec',jsonb_array_length(public.server_gateway_bootstrap_context_v2('00000000-0000-0000-0000-000000000001'::uuid,'meditation','{}','{}',statement_timestamp(),'auto')->'specs')=1);
select pg_temp.check_it('stale bootstrap keeps reason',public.server_gateway_bootstrap_context_v2('00000000-0000-0000-0000-000000000001'::uuid,'meditation','{}','{}',statement_timestamp(),'auto')->'routing'->>'fallback_reason'='needs_revalidation');
update private.spec_registry set last_verified_at=statement_timestamp() where spec_key='meditation_six_phase';
update private.intent_routing_registry set spec_keys=array['absent_spec'] where route_key='meditation_start';
select pg_temp.check_it('missing spec blocks fast path',public.server_gateway_resolve_intent('meditation')->>'fallback_reason'='broken_registration');
select pg_temp.check_it('missing ref preserved for scoped repair',public.server_gateway_resolve_intent('meditation')->'matches'->0->'registration'->'issues'->0->>'spec_key'='absent_spec');
update private.intent_routing_registry set spec_keys=array['meditation_six_phase'] where route_key='meditation_start';
select pg_temp.check_it('recovery sees fresh registry',public.server_gateway_resolve_intent('meditation')->'selected'->>'route_key'='meditation_start');
select pg_temp.check_it('anon ACL denied',not has_function_privilege('anon','public.server_gateway_resolve_intent(text,text[],integer)','EXECUTE'));
select pg_temp.check_it('authenticated ACL denied',not has_function_privilege('authenticated','public.server_gateway_resolve_intent(text,text[],integer)','EXECUTE'));
select pg_temp.check_it('service ACL allowed',has_function_privilege('service_role','public.server_gateway_resolve_intent(text,text[],integer)','EXECUTE'));
select pg_temp.check_it('bootstrap anon ACL denied',not has_function_privilege('anon','public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz,text)','EXECUTE'));
select pg_temp.check_it('bootstrap service ACL allowed',has_function_privilege('service_role','public.server_gateway_bootstrap_context_v2(uuid,text,text[],text[],timestamptz,text)','EXECUTE'));
do $$ begin
 begin perform public.server_gateway_resolve_intent(repeat('x',2001)); raise exception 'oversized intent accepted';
 exception when invalid_parameter_value then perform pg_temp.check_it('intent length bound',true); end;
 begin perform public.server_gateway_resolve_intent('',array_fill('a'::text,array[21])); raise exception 'oversized topics accepted';
 exception when invalid_parameter_value then perform pg_temp.check_it('topic count bound',true); end;
 begin execute 'set local role anon'; perform public.server_gateway_resolve_intent('meditation'); raise exception 'anon executed resolver';
 exception when insufficient_privilege then null; end;
 perform pg_temp.check_it('actual anonymous call denied',true);
end $$;
select jsonb_build_object('suite','ENG-007 PostgreSQL guardrails','passed',count(*),'failed',0,'production_access',false) as result from results;
rollback;
