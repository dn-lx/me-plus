-- Controlled synthetic users and actions. Entire acceptance run rolls back.
BEGIN;
DO $$ DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); BEGIN
  PERFORM set_config('test.meplus_alice',a::text,true);
  PERFORM set_config('test.meplus_bob',b::text,true);
  INSERT INTO auth.users(id,aud,role,raw_user_meta_data) VALUES
    (a,'authenticated','authenticated','{"display_name":"Me+ acceptance A","timezone":"Europe/Berlin","account_type":"provider"}'),
    (b,'authenticated','authenticated','{"display_name":"Me+ acceptance B","timezone":"Invalid/Zone"}'),
    (c,'authenticated','authenticated',NULL);
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=a AND timezone='Europe/Berlin')
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=b AND timezone='UTC')
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=c AND timezone='UTC') THEN
    RAISE EXCEPTION 'profile bootstrap failed';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.meplus_alice'),true);
DO $$ DECLARE result jsonb; task uuid; BEGIN
  result:=public.create_meplus_native_action('{"title":"Acceptance task","due_at":"2026-10-17T12:00:00Z","request_id":"00000000-0000-0000-0000-000000000301"}');
  task:=(result->>'action_id')::uuid;
  PERFORM set_config('test.meplus_task',task::text,true);
  result:=public.create_meplus_native_action('{"title":"Acceptance task","request_id":"00000000-0000-0000-0000-000000000301"}');
  IF result->>'replayed'<>'true' OR (result->>'action_id')::uuid<>task THEN RAISE EXCEPTION 'create replay failed'; END IF;
  PERFORM public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-17T12:00:00Z","request_id":"00000000-0000-0000-0000-000000000302"}');
  PERFORM public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-18T12:00:00Z","request_id":"00000000-0000-0000-0000-000000000303"}');
  result:=public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-17T12:00:00Z","request_id":"00000000-0000-0000-0000-000000000302"}');
  IF result->>'replayed'<>'true' OR NOT EXISTS(SELECT 1 FROM public.actions WHERE id=task AND due_at='2026-10-18T12:00:00Z') THEN RAISE EXCEPTION 'stale replay repair failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.meplus_bob'),true);
DO $$ DECLARE task uuid:=current_setting('test.meplus_task')::uuid; BEGIN
  IF EXISTS(SELECT 1 FROM public.actions WHERE id=task) THEN RAISE EXCEPTION 'cross-user read'; END IF;
  BEGIN
    PERFORM public.reschedule_meplus_native_action(task,'{"due_at":"2026-10-20T12:00:00Z"}');
    RAISE EXCEPTION 'cross-user edit';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.record_meplus_action_decision(task,'completed');
    RAISE EXCEPTION 'cross-user completion';
  EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.meplus_alice'),true);
DO $$ DECLARE task uuid:=current_setting('test.meplus_task')::uuid; result jsonb; BEGIN
  PERFORM public.record_meplus_action_decision(task,'completed');
  result:=public.record_meplus_action_decision(task,'completed');
  IF result->>'replayed'<>'true' OR (SELECT count(*) FROM public.action_events WHERE action_id=task AND event_type='completed')<>1 THEN RAISE EXCEPTION 'completion replay'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.create_meplus_native_action('{"title":"Denied"}');
    RAISE EXCEPTION 'anonymous create';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
