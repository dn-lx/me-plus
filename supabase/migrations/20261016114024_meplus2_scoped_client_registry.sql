CREATE TABLE private.meplus_client_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 client text NOT NULL CHECK(client IN ('mcp','letta','n8n')),label text NOT NULL,
 token_hash text NOT NULL UNIQUE,operations text[] NOT NULL,data_scopes text[] NOT NULL,
 expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meplus_client_tokens_user_idx ON private.meplus_client_tokens(user_id);
CREATE TABLE private.meplus_client_rate_windows (
 token_id uuid NOT NULL REFERENCES private.meplus_client_tokens(id) ON DELETE CASCADE,
 bucket timestamptz NOT NULL,hits integer NOT NULL,PRIMARY KEY(token_id,bucket)
);
CREATE TABLE private.meplus_client_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token_id uuid NOT NULL REFERENCES private.meplus_client_tokens(id) ON DELETE CASCADE,
 operation text NOT NULL,ok boolean NOT NULL,request_id text,error_code text,recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meplus_client_audit_user_idx ON private.meplus_client_audit(user_id,recorded_at DESC);
CREATE INDEX meplus_client_audit_token_idx ON private.meplus_client_audit(token_id);
ALTER TABLE private.meplus_client_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.meplus_client_rate_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.meplus_client_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.meplus_client_tokens,private.meplus_client_rate_windows,private.meplus_client_audit FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_meplus_client_token(p_client text,p_label text,p_operations text[],p_data_scopes text[],p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=auth.uid(); token text; tid uuid;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_client IS NULL OR p_client NOT IN ('mcp','letta','n8n') OR nullif(btrim(p_label),'') IS NULL OR length(p_label)>80
 OR p_days IS NULL OR p_days NOT BETWEEN 1 AND 90 OR coalesce(cardinality(p_operations),0) NOT BETWEEN 1 AND 6
 OR coalesce(cardinality(p_data_scopes),0) NOT BETWEEN 1 AND 6
 OR NOT p_operations <@ ARRAY['read_state','create_task','edit_task','reschedule_task','complete_task','rate_recommendation']::text[]
 OR NOT p_data_scopes <@ ARRAY['tasks','routines','goals','guidance','health','integrations']::text[]
 OR array_position(p_operations,NULL) IS NOT NULL OR array_position(p_data_scopes,NULL) IS NOT NULL THEN
 RAISE EXCEPTION 'invalid client scope' USING ERRCODE='22023'; END IF;
 token:='meplus_'||encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO private.meplus_client_tokens(user_id,client,label,token_hash,operations,data_scopes,expires_at)
 VALUES(u,p_client,btrim(p_label),encode(extensions.digest(token,'sha256'),'hex'),p_operations,p_data_scopes,clock_timestamp()+make_interval(days=>p_days)) RETURNING id INTO tid;
 RETURN jsonb_build_object('token_id',tid,'token',token,'expires_in_days',p_days,'operations',p_operations,'data_scopes',p_data_scopes);
END;$fn$;
REVOKE ALL ON FUNCTION public.create_meplus_client_token(text,text,text[],text[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_meplus_client_token(text,text,text[],text[],integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.revoke_meplus_client_token(p_token_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 UPDATE private.meplus_client_tokens SET revoked_at=clock_timestamp() WHERE id=p_token_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'token unavailable' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('ok',true);
END;$fn$;
REVOKE ALL ON FUNCTION public.revoke_meplus_client_token(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_meplus_client_token(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_meplus_client_tokens()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT id,client,label,operations,data_scopes,expires_at,revoked_at,created_at FROM private.meplus_client_tokens WHERE user_id=auth.uid() ORDER BY created_at DESC LIMIT 100)t);
END;$fn$;
REVOKE ALL ON FUNCTION public.list_meplus_client_tokens() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_meplus_client_tokens() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_meplus_workspace(p_sections text[] DEFAULT ARRAY['tasks','routines','goals','guidance','integrations'],p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=auth.uid(); result jsonb:=jsonb_build_object('contract','meplus-workspace-v1','as_of',clock_timestamp());
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR coalesce(cardinality(p_sections),0) NOT BETWEEN 1 AND 6
 OR array_position(p_sections,NULL) IS NOT NULL OR NOT p_sections <@ ARRAY['tasks','routines','goals','guidance','health','integrations']::text[] THEN
 RAISE EXCEPTION 'invalid state scope' USING ERRCODE='22023'; END IF;
 IF 'tasks'=ANY(p_sections) THEN
 result:=result||jsonb_build_object('tasks',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM
 (SELECT id,title,instructions,domain,priority,status,estimated_minutes,available_from,due_at,planned_start,planned_end,routine_event_id,updated_at FROM public.actions WHERE user_id=u AND status IN ('proposed','planned','available','in_progress','partial') ORDER BY due_at NULLS LAST,id LIMIT p_limit)t)); END IF;
 IF 'routines'=ANY(p_sections) THEN
 result:=result||jsonb_build_object('routines',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM
 (SELECT r.id,r.title,r.domain,r.instructions,r.importance,r.active,r.normal_duration_minutes,r.reduced_duration_minutes,r.minimum_duration_minutes,
 (SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM (SELECT rs.id,rs.schedule_type,rs.timezone,rs.local_time,rs.window_start_local,rs.window_end_local,rs.starts_on,rs.ends_on,rs.enabled,rs.schedule_config->'weekdays' AS weekdays FROM public.routine_schedules rs WHERE rs.user_id=u AND rs.routine_id=r.id ORDER BY rs.id LIMIT 10)s) AS schedules
 FROM public.routines r WHERE r.user_id=u ORDER BY r.title,r.id LIMIT p_limit)t)); END IF;
 IF 'goals'=ANY(p_sections) THEN result:=result||jsonb_build_object('goals',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT id,domain,title,description,status,priority,target_date FROM public.goals WHERE user_id=u ORDER BY priority,id LIMIT p_limit)t)); END IF;
 IF 'guidance'=ANY(p_sections) THEN result:=result||jsonb_build_object('guidance',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT id,title,domain,rationale,confidence,generated_at,expires_at FROM public.recommendations WHERE user_id=u AND (expires_at IS NULL OR expires_at>clock_timestamp()) ORDER BY generated_at DESC LIMIT p_limit)t)); END IF;
 IF 'health'=ANY(p_sections) THEN result:=result||jsonb_build_object('health',public.get_health_context(u,clock_timestamp())); END IF;
 IF 'integrations'=ANY(p_sections) THEN result:=result||jsonb_build_object('integrations',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT provider,display_name,status,last_sync_at FROM public.data_sources WHERE user_id=u ORDER BY provider LIMIT p_limit)t)); END IF;
 RETURN result;
END;$fn$;
REVOKE ALL ON FUNCTION public.get_meplus_workspace(text[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_meplus_workspace(text[],integer) TO authenticated;

CREATE OR REPLACE FUNCTION private.meplus_client_denied(p_user uuid,p_token_id uuid,p_tool text,p_error text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
 INSERT INTO private.meplus_client_audit(user_id,token_id,operation,ok,error_code)
 VALUES(p_user,p_token_id,CASE WHEN p_tool IN ('read_state','create_task','edit_task','reschedule_task','complete_task','rate_recommendation') THEN p_tool ELSE 'protocol' END,false,p_error);
 RETURN jsonb_build_object('ok',false,'error',p_error);
END;$fn$;
REVOKE ALL ON FUNCTION private.meplus_client_denied(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
