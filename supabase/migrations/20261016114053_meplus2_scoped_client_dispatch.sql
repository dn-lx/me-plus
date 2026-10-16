CREATE OR REPLACE FUNCTION public.server_execute_meplus_client_tool(p_token text,p_tool text DEFAULT NULL,p_arguments jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE t private.meplus_client_tokens%rowtype; result jsonb; args jsonb:=p_arguments; allowed_keys text[]; needed_scope text;
 req uuid; aid uuid; action_row public.actions%rowtype; hits integer; old_sub text; old_claims text; sections text[];
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server role required' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR length(p_token)<>71 THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
 SELECT * INTO t FROM private.meplus_client_tokens WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
 DELETE FROM private.meplus_client_rate_windows WHERE bucket<clock_timestamp()-interval '1 day';
 INSERT INTO private.meplus_client_rate_windows VALUES(t.id,date_trunc('minute',clock_timestamp()),1)
 ON CONFLICT(token_id,bucket) DO UPDATE SET hits=least(private.meplus_client_rate_windows.hits+1,121) RETURNING private.meplus_client_rate_windows.hits INTO hits;
 IF hits>120 THEN RETURN private.meplus_client_denied(t.user_id,t.id,p_tool,'rate_limited'); END IF;
 IF p_tool IS NULL THEN RETURN jsonb_build_object('ok',true,'client',t.client,'operations',t.operations,'data_scopes',t.data_scopes); END IF;
 IF NOT p_tool=ANY(t.operations) THEN RETURN private.meplus_client_denied(t.user_id,t.id,p_tool,'forbidden'); END IF;
 needed_scope:=CASE WHEN p_tool='rate_recommendation' THEN 'guidance' WHEN p_tool='read_state' THEN NULL ELSE 'tasks' END;
 IF needed_scope IS NOT NULL AND NOT needed_scope=ANY(t.data_scopes) THEN RETURN private.meplus_client_denied(t.user_id,t.id,p_tool,'forbidden'); END IF;
 IF args IS NULL OR jsonb_typeof(args)<>'object' THEN RETURN private.meplus_client_denied(t.user_id,t.id,p_tool,'invalid_arguments'); END IF;
 allowed_keys:=CASE p_tool
 WHEN 'read_state' THEN ARRAY['sections','limit']
 WHEN 'create_task' THEN ARRAY['request_id','title','domain','priority','estimated_minutes','available_from','due_at']
 WHEN 'edit_task' THEN ARRAY['request_id','action_id','title','instructions','priority','estimated_minutes']
 WHEN 'reschedule_task' THEN ARRAY['request_id','action_id','available_from','due_at']
 WHEN 'complete_task' THEN ARRAY['request_id','action_id','status']
 WHEN 'rate_recommendation' THEN ARRAY['request_id','recommendation_id','stars','follow_through','note'] END;
 IF allowed_keys IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(args) k WHERE NOT k=ANY(allowed_keys)) THEN RETURN private.meplus_client_denied(t.user_id,t.id,p_tool,'invalid_arguments'); END IF;
 old_sub:=current_setting('request.jwt.claim.sub',true); old_claims:=current_setting('request.jwt.claims',true);
 -- Only this service-only boundary may impersonate the token's verified owner.
 -- Original request identity is restored on every outcome before returning.
 BEGIN
 PERFORM set_config('request.jwt.claim.sub',t.user_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',t.user_id,'role','authenticated')::text,true);
 IF p_tool='read_state' THEN
 IF args ? 'sections' THEN SELECT array_agg(x) INTO sections FROM jsonb_array_elements_text(args->'sections')x; ELSE sections:=t.data_scopes; END IF;
 IF sections IS NULL OR NOT sections <@ t.data_scopes THEN RAISE EXCEPTION 'scope denied' USING ERRCODE='42501'; END IF;
 result:=public.get_meplus_workspace(sections,coalesce((args->>'limit')::integer,20));
 ELSE
 req:=(args->>'request_id')::uuid;
 IF req IS NULL THEN RAISE EXCEPTION 'request required' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(t.user_id::text||':client:'||p_tool||':'||req::text,0));
 SELECT r.result INTO result FROM private.meplus_request_receipts r WHERE user_id=t.user_id AND operation='client:'||p_tool AND request_id=req;
 IF FOUND THEN result:=result||jsonb_build_object('replayed',true);
 ELSE
 CASE p_tool
 WHEN 'create_task' THEN result:=public.create_meplus_native_action(args);
 WHEN 'reschedule_task' THEN result:=public.reschedule_meplus_native_action((args->>'action_id')::uuid,args-'action_id');
 WHEN 'rate_recommendation' THEN result:=public.record_meplus_feedback(args);
 WHEN 'complete_task' THEN
 result:=public.record_meplus_action_decision((args->>'action_id')::uuid,args->>'status');
 result:=jsonb_build_object('ok',true,'replayed',result->'replayed','action_id',args->>'action_id','status',args->>'status');
 WHEN 'edit_task' THEN
 aid:=(args->>'action_id')::uuid;
 SELECT * INTO action_row FROM public.actions WHERE id=aid AND user_id=t.user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'action unavailable' USING ERRCODE='P0002'; END IF;
 IF action_row.routine_event_id IS NOT NULL OR action_row.origin<>'manual' OR action_row.status NOT IN ('proposed','planned','available','in_progress','partial') THEN RAISE EXCEPTION 'manual open action required' USING ERRCODE='22023'; END IF;
 IF (args ? 'title' AND (nullif(btrim(args->>'title'),'') IS NULL OR length(args->>'title')>200)) OR length(coalesce(args->>'instructions',''))>4000
 OR (args ? 'priority' AND (args->>'priority' IS NULL OR args->>'priority' NOT IN ('must','should','bonus')))
 OR (args ? 'estimated_minutes' AND (args->>'estimated_minutes')::integer NOT BETWEEN 0 AND 1440) THEN RAISE EXCEPTION 'invalid edit' USING ERRCODE='22023'; END IF;
 UPDATE public.actions SET title=CASE WHEN args ? 'title' THEN btrim(args->>'title') ELSE title END,
 instructions=CASE WHEN args ? 'instructions' THEN args->>'instructions' ELSE instructions END,
 priority=CASE WHEN args ? 'priority' THEN args->>'priority' ELSE priority END,
 estimated_minutes=CASE WHEN args ? 'estimated_minutes' THEN (args->>'estimated_minutes')::integer ELSE estimated_minutes END,updated_at=clock_timestamp()
 WHERE id=aid AND user_id=t.user_id;
 INSERT INTO public.action_events(user_id,action_id,event_type,metadata) VALUES(t.user_id,aid,'edited',jsonb_build_object('source','meplus_client','client',t.client,'request_id',req,'before',jsonb_build_object('title',action_row.title,'instructions',action_row.instructions,'priority',action_row.priority,'estimated_minutes',action_row.estimated_minutes)));
 result:=jsonb_build_object('ok',true,'replayed',false,'action_id',aid);
 ELSE RAISE EXCEPTION 'unsupported operation' USING ERRCODE='22023'; END CASE;
 INSERT INTO private.meplus_request_receipts VALUES(t.user_id,'client:'||p_tool,req,result,now());
 END IF;
 END IF;
 INSERT INTO private.meplus_client_audit(user_id,token_id,operation,ok,request_id) VALUES(t.user_id,t.id,p_tool,true,args->>'request_id');
 EXCEPTION WHEN OTHERS THEN
 result:=jsonb_build_object('ok',false,'error',CASE WHEN SQLSTATE='42501' THEN 'forbidden' WHEN SQLSTATE='P0002' THEN 'not_found' ELSE 'invalid_request' END);
 INSERT INTO private.meplus_client_audit(user_id,token_id,operation,ok,request_id,error_code) VALUES(t.user_id,t.id,p_tool,false,CASE WHEN args->>'request_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN args->>'request_id' ELSE NULL END,result->>'error');
 END;
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);
 RETURN result;
END;$fn$;
REVOKE ALL ON FUNCTION public.server_execute_meplus_client_tool(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_execute_meplus_client_tool(text,text,jsonb) TO service_role;
