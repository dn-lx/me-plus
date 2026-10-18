-- Deterministic native routine clock only. No reasoning worker or external API.
CREATE OR REPLACE FUNCTION private.run_meplus_native_scheduler()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u record; result jsonb; results jsonb:='[]'; failures integer:=0;
BEGIN
 FOR u IN SELECT DISTINCT r.user_id FROM public.routines r JOIN public.routine_schedules s ON s.routine_id=r.id AND s.user_id=r.user_id JOIN public.profiles p ON p.id=r.user_id WHERE (clock_timestamp() AT TIME ZONE p.timezone)::time >= time '06:00' AND (clock_timestamp() AT TIME ZONE p.timezone)::time < time '22:00' AND r.active AND s.enabled AND s.schedule_config->>'source'='meplus_native' LOOP
 BEGIN
 PERFORM public.record_scheduler_heartbeat(u.user_id,'meplus_native_routines','invoked',NULL,NULL,30,30,NULL,'supabase:native_routines');
 result:=private.meplus_materialize_native_day(u.user_id,clock_timestamp());
 PERFORM public.record_scheduler_heartbeat(u.user_id,'meplus_native_routines',CASE WHEN result->>'reason'='protected_sleep' THEN 'no_op' ELSE 'completed' END,NULL,NULL,30,30,NULL,'supabase:native_routines');
 results:=results||jsonb_build_array(result);
 EXCEPTION WHEN OTHERS THEN
 failures:=failures+1;
 PERFORM public.record_scheduler_heartbeat(u.user_id,'meplus_native_routines','failed',NULL,jsonb_build_object('error_code',SQLSTATE),30,30,NULL,'supabase:native_routines');
 results:=results||jsonb_build_array(jsonb_build_object('ok',false,'error_code',SQLSTATE));
 END;
 END LOOP;
 RETURN jsonb_build_object('ok',failures=0,'results',results);
END;$fn$;
REVOKE ALL ON FUNCTION private.run_meplus_native_scheduler() FROM PUBLIC,anon,authenticated;


SELECT cron.schedule('meplus2-native-routines', '0,30 4-20 * * *', 'SELECT private.run_meplus_native_scheduler();');
