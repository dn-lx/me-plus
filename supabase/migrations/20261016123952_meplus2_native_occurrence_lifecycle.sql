-- Reconcile only canonical native occurrences, retaining execution history.
CREATE INDEX action_events_native_occurrence_marker_idx ON public.action_events(user_id,action_id)
 WHERE event_type='created' AND metadata->>'source'='meplus_native_scheduler';
CREATE OR REPLACE FUNCTION private.meplus_reconcile_native_occurrences(p_user uuid,p_as_of timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE zone text; local_day date; local_clock time; candidate record; occurrence public.routine_events%rowtype;
 expired_count integer:=0; missed_count integer:=0; changed integer;
BEGIN
 IF p_user IS NULL OR p_as_of IS NULL THEN RAISE EXCEPTION 'user and time required' USING ERRCODE='22023'; END IF;
 SELECT timezone INTO zone FROM public.profiles WHERE id=p_user;
 IF zone IS NULL THEN RAISE EXCEPTION 'profile unavailable' USING ERRCODE='P0002'; END IF;
 local_day:=(p_as_of AT TIME ZONE zone)::date;local_clock:=(p_as_of AT TIME ZONE zone)::time;
 IF local_clock<time '06:00' OR local_clock>=time '22:00' THEN RETURN jsonb_build_object('expired',0,'missed',0,'reason','protected_sleep'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':native-materialize',0));
 FOR candidate IN SELECT re.id FROM public.routine_events re
 WHERE re.user_id=p_user AND re.status='due' AND re.occurrence_date<local_day
 AND EXISTS(SELECT 1 FROM public.actions a JOIN public.action_events e ON e.action_id=a.id AND e.user_id=a.user_id
 WHERE a.user_id=p_user AND a.routine_event_id=re.id AND a.origin='routine' AND e.event_type='created' AND e.metadata->>'source'='meplus_native_scheduler') ORDER BY re.id LOOP
 -- The action decision path locks action before occurrence. Lock every linked
 -- own action first, in stable order, then re-read the occurrence under lock.
 PERFORM a.id FROM public.actions a WHERE a.user_id=p_user AND a.routine_event_id=candidate.id ORDER BY a.id FOR UPDATE;
 SELECT * INTO occurrence FROM public.routine_events WHERE id=candidate.id AND user_id=p_user FOR UPDATE;
 IF NOT FOUND OR occurrence.status<>'due' OR occurrence.occurrence_date>=local_day THEN CONTINUE; END IF;
 IF EXISTS(SELECT 1 FROM public.actions a WHERE a.user_id=p_user AND a.routine_event_id=candidate.id
 AND (a.status IN ('completed','partial','skipped') OR a.origin<>'routine' OR a.surface_provider IS NOT NULL OR a.surface_external_id IS NOT NULL
 OR a.surface_state IN ('pending','surfaced') OR a.surface_scheduler_controls OR a.surface_must_remain_open OR a.surface_continuous_required
 OR NOT EXISTS(SELECT 1 FROM public.action_events e WHERE e.user_id=p_user AND e.action_id=a.id AND e.event_type='created' AND e.metadata->>'source'='meplus_native_scheduler'))) THEN CONTINUE; END IF;
 WITH expired AS (
 UPDATE public.actions SET status='expired',updated_at=p_as_of,
 constraint_flags=constraint_flags||jsonb_build_object('terminalized_by','meplus_native_lifecycle_v1','terminalized_at',p_as_of,'terminal_reason','prior_local_day_uncompleted')
 WHERE user_id=p_user AND routine_event_id=candidate.id AND status IN ('proposed','planned','available','in_progress') RETURNING id
 ), logged AS (
 INSERT INTO public.action_events(user_id,action_id,event_type,occurred_at,reason_code,note,metadata)
 SELECT p_user,id,'expired',p_as_of,'native_occurrence_elapsed_uncompleted','Native occurrence day elapsed without recorded execution.',
 jsonb_build_object('source','meplus_native_lifecycle','routine_event_id',candidate.id) FROM expired RETURNING id
 ) SELECT count(*) INTO changed FROM logged;
 expired_count:=expired_count+changed;
 UPDATE public.routine_events SET status='missed',updated_at=p_as_of WHERE id=candidate.id AND user_id=p_user AND status='due';
 GET DIAGNOSTICS changed=ROW_COUNT;missed_count:=missed_count+changed;
 END LOOP;
 RETURN jsonb_build_object('expired',expired_count,'missed',missed_count);
END;$fn$;
REVOKE ALL ON FUNCTION private.meplus_reconcile_native_occurrences(uuid,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.refresh_meplus_schedule()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=auth.uid(); as_of timestamptz:=clock_timestamp(); cleanup jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 cleanup:=private.meplus_reconcile_native_occurrences(u,as_of);
 RETURN private.meplus_materialize_native_day(u,as_of)||jsonb_build_object('expired',cleanup->'expired','missed',cleanup->'missed');
END;$fn$;
REVOKE ALL ON FUNCTION public.refresh_meplus_schedule() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_meplus_schedule() TO authenticated;

CREATE OR REPLACE FUNCTION private.run_meplus_native_scheduler()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u record; result jsonb; cleanup jsonb; results jsonb:='[]'; failures integer:=0; as_of timestamptz:=clock_timestamp();
BEGIN
 FOR u IN SELECT p.id user_id FROM public.profiles p WHERE (as_of AT TIME ZONE p.timezone)::time>=time '06:00' AND (as_of AT TIME ZONE p.timezone)::time<time '22:00'
 AND (EXISTS(SELECT 1 FROM public.routines r JOIN public.routine_schedules s ON s.routine_id=r.id AND s.user_id=r.user_id
 WHERE r.user_id=p.id AND r.active AND s.enabled AND s.schedule_config->>'source'='meplus_native')
 OR EXISTS(SELECT 1 FROM public.routine_events re JOIN public.actions a ON a.routine_event_id=re.id AND a.user_id=re.user_id
 JOIN public.action_events e ON e.action_id=a.id AND e.user_id=a.user_id
 WHERE re.user_id=p.id AND re.status='due' AND re.occurrence_date<(as_of AT TIME ZONE p.timezone)::date AND a.origin='routine' AND e.event_type='created' AND e.metadata->>'source'='meplus_native_scheduler')) ORDER BY p.id LOOP
 BEGIN
 PERFORM public.record_scheduler_heartbeat(u.user_id,'meplus_native_routines','invoked',NULL,NULL,30,30,NULL,'supabase:native_routines');
 cleanup:=private.meplus_reconcile_native_occurrences(u.user_id,as_of);
 result:=private.meplus_materialize_native_day(u.user_id,as_of)||cleanup;
 PERFORM public.record_scheduler_heartbeat(u.user_id,'meplus_native_routines',CASE WHEN (result->>'created')::integer+(cleanup->>'expired')::integer+(cleanup->>'missed')::integer=0 THEN 'no_op' ELSE 'completed' END,NULL,NULL,30,30,NULL,'supabase:native_routines');
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

-- Read remains side-effect-free; elapsed native partial work stays in history.
CREATE OR REPLACE FUNCTION public.get_meplus_workspace(p_sections text[] DEFAULT ARRAY['tasks','routines','goals','guidance','integrations'],p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=auth.uid(); as_of timestamptz:=clock_timestamp(); result jsonb:=jsonb_build_object('contract','meplus-workspace-v1','as_of',as_of);
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR coalesce(cardinality(p_sections),0) NOT BETWEEN 1 AND 6
 OR array_position(p_sections,NULL) IS NOT NULL OR NOT p_sections <@ ARRAY['tasks','routines','goals','guidance','health','integrations']::text[] THEN
 RAISE EXCEPTION 'invalid state scope' USING ERRCODE='22023'; END IF;
 IF 'tasks'=ANY(p_sections) THEN
 result:=result||jsonb_build_object('tasks',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM
 (SELECT id,title,instructions,domain,priority,status,estimated_minutes,available_from,due_at,planned_start,planned_end,routine_event_id,updated_at FROM public.actions WHERE user_id=u AND status IN ('proposed','planned','available','in_progress','partial') AND NOT (origin='routine' AND surface_provider IS NULL AND surface_external_id IS NULL AND coalesce(surface_state,'') NOT IN ('pending','surfaced') AND NOT surface_scheduler_controls AND NOT surface_must_remain_open AND NOT surface_continuous_required AND due_at IS NOT NULL AND due_at<=as_of AND EXISTS(SELECT 1 FROM public.action_events e WHERE e.user_id=u AND e.action_id=actions.id AND e.event_type='created' AND e.metadata->>'source'='meplus_native_scheduler')) ORDER BY due_at NULLS LAST,id LIMIT p_limit)t)); END IF;
 IF 'routines'=ANY(p_sections) THEN
 result:=result||jsonb_build_object('routines',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM
 (SELECT r.id,r.title,r.domain,r.instructions,r.importance,r.active,r.normal_duration_minutes,r.reduced_duration_minutes,r.minimum_duration_minutes,
 (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM (SELECT rs.id,rs.schedule_type,rs.timezone,rs.local_time,rs.window_start_local,rs.window_end_local,rs.starts_on,rs.ends_on,rs.enabled,rs.schedule_config->'weekdays' AS weekdays FROM public.routine_schedules rs WHERE rs.user_id=u AND rs.routine_id=r.id ORDER BY rs.id LIMIT 10)s) AS schedules
 FROM public.routines r WHERE r.user_id=u ORDER BY r.title,r.id LIMIT p_limit)t)); END IF;
 IF 'goals'=ANY(p_sections) THEN result:=result||jsonb_build_object('goals',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT id,domain,title,description,status,priority,target_date FROM public.goals WHERE user_id=u ORDER BY priority,id LIMIT p_limit)t)); END IF;
 IF 'guidance'=ANY(p_sections) THEN result:=result||jsonb_build_object('guidance',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT id,title,domain,rationale,confidence,generated_at,expires_at FROM public.recommendations WHERE user_id=u AND (expires_at IS NULL OR expires_at>as_of) ORDER BY generated_at DESC LIMIT p_limit)t)); END IF;
 IF 'health'=ANY(p_sections) THEN result:=result||jsonb_build_object('health',public.get_health_context(u,as_of)); END IF;
 IF 'integrations'=ANY(p_sections) THEN result:=result||jsonb_build_object('integrations',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT provider,display_name,status,last_sync_at FROM public.data_sources WHERE user_id=u ORDER BY provider LIMIT p_limit)t)); END IF;
 RETURN result;
END;$fn$;
REVOKE ALL ON FUNCTION public.get_meplus_workspace(text[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_meplus_workspace(text[],integer) TO authenticated;
