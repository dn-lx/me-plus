-- Me+ 2.0: one transactional action decision for Today and Me+ Gateway.
-- A browser caller can only decide on its own actions. Service-role callers
-- require the separately authenticated, bounded Gateway bridge.
CREATE OR REPLACE FUNCTION private.meplus_apply_action_decision(
  p_user_id uuid, p_action_id uuid, p_decision text, p_options jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_action public.actions%ROWTYPE;
  v_updated public.actions%ROWTYPE;
  v_event public.action_events%ROWTYPE;
  v_outcome public.outcomes%ROWTYPE;
  v_time timestamptz := clock_timestamp();
  v_version text;
  v_reason text;
  v_source text;
BEGIN
  IF p_user_id IS NULL OR p_action_id IS NULL THEN
    RAISE EXCEPTION 'user and action are required' USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('completed','partial','skipped') THEN
    RAISE EXCEPTION 'invalid decision' USING ERRCODE = '22023';
  END IF;
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'object' THEN
    RAISE EXCEPTION 'options must be an object' USING ERRCODE = '22023';
  END IF;
  v_version := nullif(p_options->>'version','');
  IF v_version IS NOT NULL AND v_version NOT IN ('full','reduced','minimum') THEN
    RAISE EXCEPTION 'invalid action version' USING ERRCODE = '22023';
  END IF;
  v_reason := nullif(p_options->>'reason_code','');
  v_source := coalesce(nullif(p_options->>'source',''),'meplus_web_ui');
  IF length(v_source) > 64 THEN
    RAISE EXCEPTION 'invalid action source' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_action FROM public.actions
    WHERE id = p_action_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'action unavailable' USING ERRCODE = 'P0002';
  END IF;
  -- A retried request must not append a second completion event.
  IF v_action.status = p_decision THEN
    RETURN jsonb_build_object('ok',true,'replayed',true,
      'action',to_jsonb(v_action),'action_event',null,'outcome',null);
  END IF;
  IF v_action.status NOT IN ('available','planned','in_progress','partial') THEN
    RAISE EXCEPTION 'action not open' USING ERRCODE = '22023';
  END IF;
  UPDATE public.actions SET
    status = p_decision,
    version = coalesce(v_version,version),
    planned_start = CASE WHEN p_options ? 'planned_start'
      THEN nullif(p_options->>'planned_start','')::timestamptz ELSE planned_start END,
    planned_end = CASE WHEN p_options ? 'planned_end'
      THEN nullif(p_options->>'planned_end','')::timestamptz ELSE planned_end END,
    updated_at = v_time
  WHERE id = p_action_id AND user_id = p_user_id
  RETURNING * INTO v_updated;
  IF v_action.routine_event_id IS NOT NULL THEN
    UPDATE public.routine_events SET
      status = p_decision,
      selected_version = v_updated.version,
      completed_at = CASE WHEN p_decision IN ('completed','partial') THEN v_time ELSE NULL END,
      skip_reason = CASE WHEN p_decision = 'skipped' THEN v_reason ELSE NULL END,
      updated_at = v_time
    WHERE id = v_action.routine_event_id AND user_id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'linked routine occurrence missing' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  INSERT INTO public.action_events (
    user_id, action_id, event_type, occurred_at, reason_code, note, metadata
  ) VALUES (
    p_user_id, p_action_id, p_decision, v_time, v_reason,
    nullif(p_options->>'note',''),
    jsonb_build_object('source',v_source,'previous_status',v_action.status,
                       'version',v_updated.version,'contract_version','meplus-action-v2')
  ) RETURNING * INTO v_event;
  IF p_options ? 'outcome' AND p_options->'outcome' IS NOT NULL AND
     p_options->'outcome' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_options->'outcome') <> 'object' OR
       nullif(p_options #>> '{outcome,outcome_type}','') IS NULL THEN
      RAISE EXCEPTION 'invalid outcome' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.outcomes (
      user_id, action_id, recommendation_id, outcome_type,
      observed_at, subjective_value, objective_refs, summary
    ) VALUES (
      p_user_id, p_action_id, v_action.recommendation_id,
      p_options #>> '{outcome,outcome_type}',
      coalesce(nullif(p_options #>> '{outcome,observed_at}','')::timestamptz,v_time),
      p_options #> '{outcome,subjective_value}',
      p_options #> '{outcome,objective_refs}',
      p_options #>> '{outcome,summary}'
    ) RETURNING * INTO v_outcome;
  END IF;
  RETURN jsonb_build_object('ok',true,'replayed',false,
    'action',to_jsonb(v_updated),'action_event',to_jsonb(v_event),
    'outcome',CASE WHEN v_outcome.id IS NULL THEN NULL ELSE to_jsonb(v_outcome) END);
END;
$function$;
REVOKE ALL ON FUNCTION private.meplus_apply_action_decision(uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;

-- Retain the old public API signature for the existing Next.js UI.
CREATE OR REPLACE FUNCTION public.record_meplus_action_decision(
  p_action_id uuid, p_decision text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  RETURN private.meplus_apply_action_decision(
    v_user,p_action_id,p_decision,jsonb_build_object('source','meplus_web_ui'));
END;
$function$;
REVOKE ALL ON FUNCTION public.record_meplus_action_decision(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_meplus_action_decision(uuid,text) TO authenticated;

-- This function is callable by service_role only; the Gateway authenticates
-- its external API key and resolves the user before invoking this boundary.
CREATE OR REPLACE FUNCTION public.server_gateway_complete_action_atomic(
  p_user_id uuid,p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, private, pg_temp
AS $function$
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '28000';
  END IF;
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' OR
     nullif(p_input->>'action_id','') IS NULL THEN
    RAISE EXCEPTION 'action id is required' USING ERRCODE = '22023';
  END IF;
  RETURN private.meplus_apply_action_decision(
    p_user_id,(p_input->>'action_id')::uuid,p_input->>'status',
    (p_input - 'action_id' - 'status') || jsonb_build_object('source','meplus_gateway'));
END;
$function$;
REVOKE ALL ON FUNCTION public.server_gateway_complete_action_atomic(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_gateway_complete_action_atomic(uuid,jsonb)
  TO service_role;
