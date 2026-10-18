CREATE TABLE private.meplus_request_receipts (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 operation text NOT NULL, request_id uuid NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,operation,request_id)
);
ALTER TABLE private.meplus_request_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.meplus_request_receipts FROM PUBLIC,anon,authenticated;
ALTER TABLE public.routine_schedules ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.recommendation_feedback ADD COLUMN IF NOT EXISTS follow_through text
 CHECK(follow_through IN ('yes','partly','no','not_applicable'));
CREATE TABLE public.routine_change_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 routine_id uuid NOT NULL, request_id uuid NOT NULL, before_state jsonb, after_state jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(routine_id,user_id) REFERENCES public.routines(id,user_id),
 UNIQUE(user_id,request_id)
);
ALTER TABLE public.routine_change_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY routine_change_events_own_read ON public.routine_change_events FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()));
REVOKE ALL ON public.routine_change_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.routine_change_events TO authenticated;
CREATE INDEX routine_change_events_routine_user_idx ON public.routine_change_events(routine_id,user_id);

CREATE OR REPLACE FUNCTION public.save_meplus_routine(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 u uuid:=auth.uid(); req uuid; rid uuid; sid uuid; prior jsonb; result jsonb;
 s jsonb; kind text; tz text; st time; en time; at_time time; days jsonb; prior_schedule jsonb;
 duration integer; importance integer;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR EXISTS(
 SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN
 ('request_id','routine_id','title','domain','instructions','importance','normal_duration_minutes','reduced_duration_minutes','minimum_duration_minutes','active','schedule')) THEN
 RAISE EXCEPTION 'invalid routine fields' USING ERRCODE='22023'; END IF;
 req:=(p_input->>'request_id')::uuid;
 IF req IS NULL THEN RAISE EXCEPTION 'request_id required' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':save-routine:'||req::text,0));
 SELECT r.result INTO result FROM private.meplus_request_receipts r WHERE r.user_id=u AND r.operation='save_routine' AND r.request_id=req;
 IF FOUND THEN RETURN result||jsonb_build_object('replayed',true); END IF;
 importance:=coalesce((p_input->>'importance')::integer,3);
 duration:=(p_input->>'normal_duration_minutes')::integer;
 IF nullif(btrim(p_input->>'title'),'') IS NULL OR length(p_input->>'title')>200
 OR nullif(btrim(p_input->>'domain'),'') IS NULL OR length(p_input->>'domain')>60
 OR importance NOT BETWEEN 1 AND 5 OR duration NOT BETWEEN 1 AND 1440
 OR duration IS NULL OR length(coalesce(p_input->>'instructions',''))>4000
 OR coalesce((p_input->>'reduced_duration_minutes')::integer,0) NOT BETWEEN 0 AND duration
 OR coalesce((p_input->>'minimum_duration_minutes')::integer,0) NOT BETWEEN 0 AND duration THEN
 RAISE EXCEPTION 'invalid routine definition' USING ERRCODE='22023'; END IF;
 rid:=nullif(p_input->>'routine_id','')::uuid;
 IF rid IS NOT NULL THEN
 SELECT to_jsonb(r) INTO prior FROM public.routines r WHERE id=rid AND user_id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'routine unavailable' USING ERRCODE='P0002'; END IF;
 ELSE rid:=gen_random_uuid(); END IF;
 s:=p_input->'schedule';
 IF s IS NOT NULL AND s<>'null'::jsonb THEN
 IF jsonb_typeof(s)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(s) k WHERE k NOT IN
 ('schedule_id','type','timezone','local_time','window_start','window_end','weekdays','starts_on','ends_on','enabled')) THEN
 RAISE EXCEPTION 'invalid schedule fields' USING ERRCODE='22023'; END IF;
 kind:=s->>'type'; tz:=s->>'timezone'; st:=(s->>'window_start')::time; en:=(s->>'window_end')::time; at_time:=(s->>'local_time')::time;
 days:=s->'weekdays';
 IF kind IS NULL OR kind NOT IN ('daily','weekly','once') OR tz IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=tz)
 OR tz IS DISTINCT FROM (SELECT timezone FROM public.profiles WHERE id=u)
 OR st IS NULL OR en IS NULL OR en<=st
 OR st<time '06:00' OR en>time '22:00'
 OR (at_time IS NOT NULL AND (at_time<st OR at_time>=en)) THEN
 RAISE EXCEPTION 'invalid schedule window or recurrence' USING ERRCODE='22023'; END IF;
 IF kind='weekly' THEN
 IF days IS NULL OR jsonb_typeof(days)<>'array' OR jsonb_array_length(days) NOT BETWEEN 1 AND 7 THEN
 RAISE EXCEPTION 'weekly weekdays required' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(days) d WHERE jsonb_typeof(d)<>'number' OR d::text !~ '^[1-7]$') THEN
 RAISE EXCEPTION 'weekdays must be ISO integers 1 to 7' USING ERRCODE='22023'; END IF;
 END IF;
 IF kind='once' AND (s->>'starts_on' IS NULL OR s->>'starts_on' IS DISTINCT FROM s->>'ends_on') THEN
 RAISE EXCEPTION 'once schedule requires a single date' USING ERRCODE='22023'; END IF;
 sid:=nullif(s->>'schedule_id','')::uuid;
 IF sid IS NOT NULL THEN
 SELECT to_jsonb(rs) INTO prior_schedule FROM public.routine_schedules rs WHERE id=sid AND user_id=u AND routine_id=rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'schedule unavailable' USING ERRCODE='P0002'; END IF;
 ELSIF prior IS NOT NULL AND EXISTS(SELECT 1 FROM public.routine_schedules WHERE user_id=u AND routine_id=rid) THEN
 RAISE EXCEPTION 'schedule_id required to edit an existing schedule' USING ERRCODE='22023';
 ELSE sid:=gen_random_uuid(); END IF;
 END IF;
 INSERT INTO public.routines(id,user_id,title,domain,instructions,importance,normal_duration_minutes,reduced_duration_minutes,minimum_duration_minutes,active)
 VALUES(rid,u,btrim(p_input->>'title'),btrim(p_input->>'domain'),p_input->>'instructions',importance,duration,
 (p_input->>'reduced_duration_minutes')::integer,(p_input->>'minimum_duration_minutes')::integer,coalesce((p_input->>'active')::boolean,true))
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,domain=excluded.domain,instructions=excluded.instructions,
 importance=excluded.importance,normal_duration_minutes=excluded.normal_duration_minutes,
 reduced_duration_minutes=excluded.reduced_duration_minutes,minimum_duration_minutes=excluded.minimum_duration_minutes,active=excluded.active;
 IF sid IS NOT NULL THEN
 INSERT INTO public.routine_schedules(id,user_id,routine_id,schedule_type,timezone,local_time,window_start_local,window_end_local,schedule_config,starts_on,ends_on,enabled)
 VALUES(sid,u,rid,kind,tz,at_time,st,en,jsonb_build_object('weekdays',days,'source','meplus_native'),
 (s->>'starts_on')::date,(s->>'ends_on')::date,coalesce((s->>'enabled')::boolean,true))
 ON CONFLICT(id) DO UPDATE SET schedule_type=excluded.schedule_type,timezone=excluded.timezone,local_time=excluded.local_time,
 window_start_local=excluded.window_start_local,window_end_local=excluded.window_end_local,schedule_config=excluded.schedule_config,
 starts_on=excluded.starts_on,ends_on=excluded.ends_on,enabled=excluded.enabled;
 END IF;
 INSERT INTO public.routine_change_events(user_id,routine_id,request_id,before_state,after_state)
 VALUES(u,rid,req,CASE WHEN prior IS NULL THEN NULL ELSE jsonb_build_object('routine',prior,'schedule',prior_schedule) END,jsonb_build_object('routine',p_input-'request_id','schedule_id',sid));
 result:=jsonb_build_object('ok',true,'replayed',false,'routine_id',rid,'schedule_id',sid);
 INSERT INTO private.meplus_request_receipts VALUES(u,'save_routine',req,result,now());
 RETURN result;
END;$fn$;
REVOKE ALL ON FUNCTION public.save_meplus_routine(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_meplus_routine(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_meplus_feedback(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=auth.uid(); req uuid; rid uuid; fid uuid; stars integer; followed text; result jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN
 ('request_id','recommendation_id','stars','follow_through','note')) THEN RAISE EXCEPTION 'invalid feedback fields' USING ERRCODE='22023'; END IF;
 req:=(p_input->>'request_id')::uuid; rid:=(p_input->>'recommendation_id')::uuid; stars:=(p_input->>'stars')::integer; followed:=p_input->>'follow_through';
 IF req IS NULL OR rid IS NULL OR stars IS NULL OR stars NOT BETWEEN 1 AND 5
 OR (followed IS NOT NULL AND followed NOT IN ('yes','partly','no','not_applicable')) OR length(coalesce(p_input->>'note',''))>1000 THEN
 RAISE EXCEPTION 'invalid feedback' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':feedback:'||req::text,0));
 SELECT r.result INTO result FROM private.meplus_request_receipts r WHERE r.user_id=u AND r.operation='feedback' AND r.request_id=req;
 IF FOUND THEN RETURN result||jsonb_build_object('replayed',true); END IF;
 PERFORM 1 FROM public.recommendations WHERE id=rid AND user_id=u;
 IF NOT FOUND THEN RAISE EXCEPTION 'recommendation unavailable' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.recommendation_feedback(user_id,recommendation_id,helpfulness,follow_through,note,recorded_at)
 VALUES(u,rid,stars,followed,p_input->>'note',clock_timestamp()) RETURNING id INTO fid;
 result:=jsonb_build_object('ok',true,'replayed',false,'feedback_id',fid);
 INSERT INTO private.meplus_request_receipts VALUES(u,'feedback',req,result,now());
 RETURN result;
END;$fn$;
REVOKE ALL ON FUNCTION public.record_meplus_feedback(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_meplus_feedback(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.meplus_materialize_native_day(p_user uuid,p_as_of timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s record; d date; result jsonb; count_created integer:=0; local_clock time; tz text;
BEGIN
 SELECT timezone INTO tz FROM public.profiles WHERE id=p_user;
 IF tz IS NULL THEN RAISE EXCEPTION 'profile unavailable' USING ERRCODE='P0002'; END IF;
 local_clock:=(p_as_of AT TIME ZONE tz)::time;
 IF local_clock<time '06:00' OR local_clock>=time '22:00' THEN RETURN jsonb_build_object('ok',true,'created',0,'reason','protected_sleep'); END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text||':native-materialize',0));
 FOR s IN SELECT rs.* FROM public.routine_schedules rs JOIN public.routines r ON r.id=rs.routine_id AND r.user_id=rs.user_id
 WHERE rs.user_id=p_user AND rs.enabled AND rs.schedule_config->>'source'='meplus_native' AND r.active AND rs.schedule_type IN ('daily','weekly','once') ORDER BY rs.id LOOP
 IF s.timezone IS DISTINCT FROM tz THEN RAISE EXCEPTION 'native schedule timezone must match profile' USING ERRCODE='22023'; END IF;
 d:=(p_as_of AT TIME ZONE s.timezone)::date;
 IF (s.starts_on IS NOT NULL AND d<s.starts_on) OR (s.ends_on IS NOT NULL AND d>s.ends_on) THEN CONTINUE; END IF;
 IF s.schedule_type='once' AND (s.starts_on IS NULL OR d<>s.starts_on) THEN CONTINUE; END IF;
 IF s.schedule_type='weekly' AND NOT coalesce((s.schedule_config->'weekdays') @> to_jsonb(ARRAY[extract(isodow FROM d)::integer]),false) THEN CONTINUE; END IF;
 IF s.window_end_local IS NULL OR (p_as_of AT TIME ZONE s.timezone)::time>=s.window_end_local THEN CONTINUE; END IF;
 IF EXISTS(SELECT 1 FROM public.routine_events WHERE user_id=p_user AND routine_schedule_id=s.id AND occurrence_date=d) THEN CONTINUE; END IF;
 result:=public.scheduler_materialize_routine_action(p_user,s.routine_id,s.id,d,NULL);
 UPDATE public.actions SET reason='Configured native routine occurrence.' WHERE id=(result->>'action_id')::uuid AND user_id=p_user;
 INSERT INTO public.action_events(user_id,action_id,event_type,metadata)
 VALUES(p_user,(result->>'action_id')::uuid,'created',jsonb_build_object('source','meplus_native_scheduler','routine_schedule_id',s.id,'occurrence_date',d));
 count_created:=count_created+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'created',count_created);
END;$fn$;
REVOKE ALL ON FUNCTION private.meplus_materialize_native_day(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.refresh_meplus_schedule()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 RETURN private.meplus_materialize_native_day(auth.uid(),clock_timestamp());
END;$fn$;
REVOKE ALL ON FUNCTION public.refresh_meplus_schedule() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_meplus_schedule() TO authenticated;

CREATE OR REPLACE FUNCTION private.run_meplus_native_scheduler()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u record; result jsonb; results jsonb:='[]'; failures integer:=0;
BEGIN
 FOR u IN SELECT DISTINCT r.user_id FROM public.routines r JOIN public.routine_schedules s ON s.routine_id=r.id AND s.user_id=r.user_id WHERE r.active AND s.enabled AND s.schedule_config->>'source'='meplus_native' LOOP
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

COMMENT ON FUNCTION public.save_meplus_routine(jsonb) IS 'Full routine replacement; omitted/null schedule preserves schedules. Disable via schedule_id + enabled=false. Definition edits affect future occurrences; existing execution snapshots and history remain unchanged. Native recurrence supports daily, ISO weekly weekdays and once. Windows are availability, not calendar bookings.';
