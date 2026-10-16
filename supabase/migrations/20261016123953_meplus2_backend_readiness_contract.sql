-- Configuration evidence for the next product phase, not an E2E release claim.
CREATE OR REPLACE FUNCTION public.get_meplus_backend_readiness()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=auth.uid(); zone text; onboarded boolean; profile_ok boolean; timezone_covered boolean;
 owner_apis jsonb; owner_ok boolean; service_ok boolean; internal_ok boolean; clock_ok boolean; integrations jsonb; configured boolean;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 SELECT p.timezone,p.onboarding_completed_at IS NOT NULL INTO zone,onboarded FROM public.profiles p WHERE p.id=u;
 profile_ok:=FOUND AND EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=zone);
 -- The installed UTC clock covers this project's Berlin waking window across
 -- DST. Other valid profile zones need explicit clock coverage verification.
 timezone_covered:=zone='Europe/Berlin';
 SELECT jsonb_agg(jsonb_build_object('capability',label,'available',available) ORDER BY label),bool_and(available) INTO owner_apis,owner_ok
 FROM (SELECT label,coalesce(to_regprocedure(signature) IS NOT NULL AND has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE') AND NOT has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'),false) available FROM (VALUES
 ('workspace','public.get_meplus_workspace(text[],integer)'),('create_task','public.create_meplus_native_action(jsonb)'),
 ('reschedule_task','public.reschedule_meplus_native_action(uuid,jsonb)'),('complete_task','public.record_meplus_action_decision(uuid,text)'),
 ('routines','public.save_meplus_routine(jsonb)'),('schedule_refresh','public.refresh_meplus_schedule()'),('feedback','public.record_meplus_feedback(jsonb)'),
 ('create_client_token','public.create_meplus_client_token(text,text,text[],text[],integer)'),('list_client_tokens','public.list_meplus_client_tokens()'),('revoke_client_token','public.revoke_meplus_client_token(uuid)'),
 ('integration_status','public.get_meplus_integration_status()'),('integration_probe','public.request_meplus_integration_probe(text,uuid)'),('integration_controls','public.set_meplus_integration_state(text,text,uuid)')
 )f(label,signature))checked;
 SELECT bool_and(coalesce(to_regprocedure(signature) IS NOT NULL AND has_function_privilege('service_role',to_regprocedure(signature),'EXECUTE') AND NOT has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE') AND NOT has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'),false)) INTO service_ok
 FROM (VALUES('public.server_execute_meplus_client_tool(text,text,jsonb)'),('public.server_record_meplus_integration_probe(uuid,text,boolean)'))f(signature);
 SELECT bool_and(coalesce(to_regprocedure(signature) IS NOT NULL AND NOT has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE') AND NOT has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'),false)) INTO internal_ok
 FROM (VALUES('private.meplus_reconcile_native_occurrences(uuid,timestamptz)'),('private.meplus_materialize_native_day(uuid,timestamptz)'),('private.run_meplus_native_scheduler()'),('private.run_meplus_integration_clock(text)'))f(signature);
 SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname='meplus2-native-routines' AND active AND schedule='0,30 4-20 * * *' AND command='SELECT private.run_meplus_native_scheduler();') INTO clock_ok;
 integrations:=public.get_meplus_integration_status();
 configured:=coalesce(profile_ok AND timezone_covered AND owner_ok AND service_ok AND internal_ok AND clock_ok,false);
 RETURN jsonb_build_object('contract','meplus-backend-readiness-v1','as_of',clock_timestamp(),'evidence_scope','current_database_configuration',
 'backend_configuration_ready',configured,'owner_profile',jsonb_build_object('configured',profile_ok,'timezone',zone,'native_clock_timezone_covered',timezone_covered,'onboarding_completed',coalesce(onboarded,false)),
 'checks',jsonb_build_object('owner_apis',owner_apis,'service_boundaries',service_ok,'private_boundaries',internal_ok,'native_clock',clock_ok),
 'integrations',integrations,'next_work',CASE WHEN configured THEN 'app_and_website_implementation_and_user_acceptance' ELSE 'resolve_backend_configuration_checks' END,
 'acceptance_gates',jsonb_build_object('signed_in_app_e2e','pending','physical_device_upload_and_retry','pending','provider_authorization','deferred_by_user','n26','deferred_by_user','optional_hosts','selective_adoption_gates'));
END;$fn$;
REVOKE ALL ON FUNCTION public.get_meplus_backend_readiness() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_meplus_backend_readiness() TO authenticated;
