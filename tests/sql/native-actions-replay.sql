-- This must fail on the recovered v1 implementation, then pass after repair.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE task uuid; result jsonb; BEGIN
  result := public.create_meplus_native_action('{"title":"Replay fixture","due_at":"2026-10-17T12:00:00Z"}');
  task := (result->>'action_id')::uuid;
  -- A: accepted but unchanged. B: a newer edit. Retry A must preserve B.
  PERFORM public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-17T12:00:00Z","request_id":"00000000-0000-0000-0000-000000000201"}');
  PERFORM public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-18T12:00:00Z","request_id":"00000000-0000-0000-0000-000000000202"}');
  result := public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-17T12:00:00Z","request_id":"00000000-0000-0000-0000-000000000201"}');
  IF result->>'replayed' <> 'true' OR NOT EXISTS (SELECT 1 FROM public.actions WHERE id=task AND due_at='2026-10-18T12:00:00Z') THEN
    RAISE EXCEPTION 'no-op retry overwrote a newer edit';
  END IF;
  IF (SELECT count(*) FROM public.action_events WHERE action_id=task AND metadata->>'request_id'='00000000-0000-0000-0000-000000000201') <> 1 THEN
    RAISE EXCEPTION 'no-op receipt missing or duplicated';
  END IF;
END $$;
RESET ROLE;
-- Non-native events with the same request UUID must not suppress native work.
INSERT INTO public.action_events(user_id,action_id,event_type,metadata)
SELECT user_id,id,kind,jsonb_build_object('source','other_fixture','request_id','00000000-0000-0000-0000-000000000203')
FROM public.actions CROSS JOIN unnest(ARRAY['created','rescheduled']) AS kind
WHERE title='Replay fixture';
SET LOCAL ROLE authenticated;
DO $$ DECLARE task uuid; other_task uuid; result jsonb; BEGIN
  SELECT id INTO STRICT other_task FROM public.actions WHERE title='Replay fixture';
  result := public.create_meplus_native_action('{"title":"Native collision fixture","request_id":"00000000-0000-0000-0000-000000000203"}');
  task := (result->>'action_id')::uuid;
  IF result->>'replayed' <> 'false' OR task=other_task THEN RAISE EXCEPTION 'non-native create event suppressed create'; END IF;
  result := public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-19T12:00:00Z","request_id":"00000000-0000-0000-0000-000000000203"}');
  IF result->>'replayed' <> 'false' OR NOT EXISTS (SELECT 1 FROM public.actions WHERE id=task AND due_at='2026-10-19T12:00:00Z') THEN
    RAISE EXCEPTION 'non-native reschedule event suppressed edit';
  END IF;
  BEGIN
    PERFORM public.reschedule_meplus_native_action(other_task,'{"due_at":"2026-10-20T12:00:00Z","request_id":"00000000-0000-0000-0000-000000000203"}');
    RAISE EXCEPTION 'cross-action request reuse accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'PASS: stale no-op retry, source scope and cross-action request reuse' AS result;
