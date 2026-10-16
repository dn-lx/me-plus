BEGIN;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.create_meplus_native_action('{}');
    RAISE EXCEPTION 'anonymous create allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.reschedule_meplus_native_action(gen_random_uuid(), '{}');
    RAISE EXCEPTION 'anonymous reschedule allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  alice constant text := '00000000-0000-0000-0000-000000000001';
  bob constant text := '00000000-0000-0000-0000-000000000002';
  req constant text := '00000000-0000-0000-0000-000000000101';
  reschedule_req constant text := '00000000-0000-0000-0000-000000000102';
  task uuid; bob_task uuid; result jsonb; before_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.create_meplus_native_action('{"title":"No actor"}');
    RAISE EXCEPTION 'missing actor accepted';
  EXCEPTION WHEN invalid_authorization_specification THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub', alice, true);
  result := public.create_meplus_native_action(jsonb_build_object('title','Native fixture','priority','must','estimated_minutes',20,'request_id',req));
  task := (result->>'action_id')::uuid;
  IF result->>'ok' <> 'true' OR NOT EXISTS (SELECT 1 FROM public.actions WHERE id=task AND user_id=alice::uuid AND status='planned') THEN
    RAISE EXCEPTION 'create ownership/status failed';
  END IF;
  result := public.create_meplus_native_action(jsonb_build_object('title','Native fixture','request_id',req));
  IF result->>'replayed' <> 'true' OR (result->>'action_id')::uuid <> task OR (SELECT count(*) FROM public.action_events WHERE action_id=task) <> 1 THEN
    RAISE EXCEPTION 'create retry duplicated work';
  END IF;
  BEGIN
    PERFORM public.create_meplus_native_action(jsonb_build_object('title','Forged owner','user_id',bob));
    RAISE EXCEPTION 'owner injection accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.create_meplus_native_action('{"title":" "}');
    RAISE EXCEPTION 'blank title accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.create_meplus_native_action('{"title":"Invalid","estimated_minutes":1441}');
    RAISE EXCEPTION 'invalid duration accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.create_meplus_native_action('{"title":"Invalid","available_from":"2026-10-16T12:00:00Z","due_at":"2026-10-16T11:00:00Z"}');
    RAISE EXCEPTION 'inverted create window accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  SELECT count(*) INTO before_count FROM public.actions;
  PERFORM set_config('test.reject_event','yes',true);
  BEGIN
    PERFORM public.create_meplus_native_action('{"title":"Must roll back"}');
    RAISE EXCEPTION 'event failure ignored';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM set_config('test.reject_event','no',true);
  IF (SELECT count(*) FROM public.actions) <> before_count THEN RAISE EXCEPTION 'create left orphan action'; END IF;
  PERFORM set_config('request.jwt.claim.sub', bob, true);
  IF EXISTS (SELECT 1 FROM public.actions WHERE id=task) THEN RAISE EXCEPTION 'cross-user read allowed'; END IF;
  BEGIN
    PERFORM public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-17T12:00:00Z"}');
    RAISE EXCEPTION 'cross-user reschedule allowed';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  result := public.create_meplus_native_action(jsonb_build_object('title','Bob fixture','request_id',req));
  bob_task := (result->>'action_id')::uuid;
  IF bob_task=task OR result->>'replayed' <> 'false' THEN RAISE EXCEPTION 'request dedupe crossed users'; END IF;
  PERFORM set_config('request.jwt.claim.sub', alice, true);
  result := public.reschedule_meplus_native_action(task,jsonb_build_object('available_from','2026-10-17T10:00:00Z','due_at','2026-10-17T12:00:00Z','request_id',reschedule_req));
  IF result->>'ok' <> 'true' OR NOT EXISTS (SELECT 1 FROM public.actions WHERE id=task AND due_at='2026-10-17T12:00:00Z') THEN RAISE EXCEPTION 'reschedule failed'; END IF;
  result := public.reschedule_meplus_native_action(task,jsonb_build_object('due_at','2026-10-17T12:00:00Z','request_id',reschedule_req));
  IF result->>'replayed' <> 'true' OR (SELECT count(*) FROM public.action_events WHERE action_id=task AND event_type='rescheduled') <> 1 THEN RAISE EXCEPTION 'reschedule retry duplicated event'; END IF;
  BEGIN
    PERFORM public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-17T09:00:00Z"}');
    RAISE EXCEPTION 'inverted reschedule window accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM set_config('test.reject_event','yes',true);
  BEGIN
    PERFORM public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-18T12:00:00Z"}');
    RAISE EXCEPTION 'reschedule event failure ignored';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM set_config('test.reject_event','no',true);
  IF NOT EXISTS (SELECT 1 FROM public.actions WHERE id=task AND due_at='2026-10-17T12:00:00Z') THEN RAISE EXCEPTION 'reschedule failed to roll back'; END IF;
END $$;
RESET ROLE;
UPDATE public.actions SET routine_event_id=gen_random_uuid() WHERE title='Native fixture';
SET LOCAL ROLE authenticated;
DO $$ DECLARE task uuid; BEGIN
  SELECT id INTO STRICT task FROM public.actions WHERE title='Native fixture';
  BEGIN
    PERFORM public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-18T12:00:00Z"}');
    RAISE EXCEPTION 'routine occurrence rescheduled through manual flow';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.actions SET routine_event_id=NULL,status='completed' WHERE title='Native fixture';
SET LOCAL ROLE authenticated;
DO $$ DECLARE task uuid; BEGIN
  SELECT id INTO STRICT task FROM public.actions WHERE title='Native fixture';
  BEGIN
    PERFORM public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-18T12:00:00Z"}');
    RAISE EXCEPTION 'completed action rescheduled';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'PASS: native ownership, replay, validation and rollback contract' AS result;
