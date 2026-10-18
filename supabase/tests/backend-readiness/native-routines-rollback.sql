BEGIN;
DO $$ DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); rec uuid:=gen_random_uuid(); BEGIN
 PERFORM set_config('test.routine_a',a::text,true); PERFORM set_config('test.routine_b',b::text,true); PERFORM set_config('test.feedback_rec',rec::text,true);
 INSERT INTO auth.users(id) VALUES(a),(b);
 INSERT INTO public.profiles(id,timezone) VALUES(a,'Europe/Berlin'),(b,'Europe/Berlin') ON CONFLICT(id) DO UPDATE SET timezone=excluded.timezone;
 INSERT INTO public.recommendations(id,user_id,recommendation_type,domain,title,rationale,confidence,policy_version)
 VALUES(rec,a,'guidance','personal','Synthetic recommendation','Synthetic fixture','medium','acceptance');
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.routine_a'),true);
DO $$ DECLARE r jsonb; rid uuid; sid uuid; req uuid:=gen_random_uuid(); schedule jsonb; base jsonb; BEGIN
 schedule:='{"type":"daily","timezone":"Europe/Berlin","window_start":"06:00","window_end":"22:00","local_time":"09:00"}';
 base:=jsonb_build_object('request_id',req,'title','Synthetic daily routine','domain','personal','normal_duration_minutes',20,'schedule',schedule);
 r:=public.save_meplus_routine(base);rid:=(r->>'routine_id')::uuid;sid:=(r->>'schedule_id')::uuid;
 PERFORM set_config('test.routine_id',rid::text,true);PERFORM set_config('test.schedule_id',sid::text,true);
 r:=public.save_meplus_routine(base);
 IF r->>'replayed'<>'true' OR (r->>'routine_id')::uuid<>rid OR (SELECT count(*) FROM public.routine_change_events WHERE routine_id=rid)<>1 THEN RAISE EXCEPTION 'routine replay failed'; END IF;
 BEGIN
 PERFORM public.save_meplus_routine(base||jsonb_build_object('request_id',gen_random_uuid(),'schedule',schedule||'{"window_start":"05:00"}'::jsonb));
 RAISE EXCEPTION 'sleep window accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
 PERFORM public.save_meplus_routine(base||jsonb_build_object('request_id',gen_random_uuid(),'schedule',schedule||'{"type":"weekly","weekdays":[8]}'::jsonb));
 RAISE EXCEPTION 'invalid weekday accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
 PERFORM public.save_meplus_routine(base||jsonb_build_object('request_id',gen_random_uuid(),'schedule',schedule||'{"timezone":"UTC"}'::jsonb));
 RAISE EXCEPTION 'profile timezone mismatch accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.save_meplus_routine(base||jsonb_build_object('request_id',gen_random_uuid(),'title','Synthetic Friday routine','schedule',schedule||'{"type":"weekly","weekdays":[5]}'::jsonb));
 PERFORM public.save_meplus_routine(base||jsonb_build_object('request_id',gen_random_uuid(),'title','Synthetic one-time routine','schedule',schedule||'{"type":"once","starts_on":"2026-10-16","ends_on":"2026-10-16"}'::jsonb));
 r:=public.record_meplus_feedback(jsonb_build_object('request_id',req,'recommendation_id',current_setting('test.feedback_rec'),'stars',4,'follow_through','partly'));
 r:=public.record_meplus_feedback(jsonb_build_object('request_id',req,'recommendation_id',current_setting('test.feedback_rec'),'stars',4));
 IF r->>'replayed'<>'true' OR (SELECT count(*) FROM public.recommendation_feedback)<>1 THEN RAISE EXCEPTION 'feedback replay failed'; END IF;
 PERFORM public.record_meplus_feedback(jsonb_build_object('request_id',gen_random_uuid(),'recommendation_id',current_setting('test.feedback_rec'),'stars',5));
 IF (SELECT count(*) FROM public.recommendation_feedback)<>2 THEN RAISE EXCEPTION 'rating correction history lost'; END IF;
 BEGIN
 PERFORM public.record_meplus_feedback(jsonb_build_object('request_id',gen_random_uuid(),'recommendation_id',current_setting('test.feedback_rec'),'stars',6));
 RAISE EXCEPTION 'invalid rating accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.routine_b'),true);
DO $$ BEGIN
 BEGIN
 PERFORM public.save_meplus_routine(jsonb_build_object('request_id',gen_random_uuid(),'routine_id',current_setting('test.routine_id'),'title','Denied','domain','personal','normal_duration_minutes',10));
 RAISE EXCEPTION 'cross-user routine edit';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN
 PERFORM public.record_meplus_feedback(jsonb_build_object('request_id',gen_random_uuid(),'recommendation_id',current_setting('test.feedback_rec'),'stars',3));
 RAISE EXCEPTION 'cross-user rating';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.routines WHERE id=current_setting('test.routine_id')::uuid) THEN RAISE EXCEPTION 'routine read leak'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE a uuid:=current_setting('test.routine_a')::uuid; r jsonb; BEGIN
 -- A non-native schedule must never be adopted by the native scheduler.
 INSERT INTO public.routine_schedules(user_id,routine_id,schedule_type,timezone,window_start_local,window_end_local,enabled,schedule_config)
 VALUES(a,current_setting('test.routine_id')::uuid,'daily','UTC','06:00','22:00',true,'{"source":"legacy_fixture"}');
 r:=private.meplus_materialize_native_day(a,'2026-10-16T08:00:00Z');
 IF (r->>'created')::integer<>3 THEN RAISE EXCEPTION 'daily weekly once materialization failed: %',r; END IF;
 r:=private.meplus_materialize_native_day(a,'2026-10-16T08:00:00Z');
 IF (r->>'created')::integer<>0 THEN RAISE EXCEPTION 'duplicate routine occurrence'; END IF;
 r:=private.meplus_materialize_native_day(a,'2026-10-17T08:00:00Z');
 IF (r->>'created')::integer<>1 THEN RAISE EXCEPTION 'weekly/once recurrence mismatch: %',r; END IF;
 r:=private.meplus_materialize_native_day(a,'2026-10-18T00:00:00Z');
 IF r->>'reason'<>'protected_sleep' THEN RAISE EXCEPTION 'sleep gate failed'; END IF;
 -- Berlin DST change: occurrences remain distinct and retain local windows.
 r:=private.meplus_materialize_native_day(a,'2026-10-25T08:00:00Z');
 IF (r->>'created')::integer<>1 OR NOT EXISTS(SELECT 1 FROM public.routine_events WHERE user_id=a AND occurrence_date='2026-10-25' AND window_start='2026-10-25T05:00:00Z' AND window_end='2026-10-25T21:00:00Z') THEN RAISE EXCEPTION 'DST window failed'; END IF;
 UPDATE public.routine_schedules SET enabled=false WHERE id=current_setting('test.schedule_id')::uuid;
 r:=private.meplus_materialize_native_day(a,'2026-10-18T08:00:00Z');
 IF (r->>'created')::integer<>0 THEN RAISE EXCEPTION 'disabled schedule ran'; END IF;
 IF EXISTS(SELECT 1 FROM public.actions WHERE user_id=a AND surface_provider IS NOT NULL) THEN RAISE EXCEPTION 'native scheduler touched external surface'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.save_meplus_routine('{}'); RAISE EXCEPTION 'anonymous routine'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.record_meplus_feedback('{}'); RAISE EXCEPTION 'anonymous feedback'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
