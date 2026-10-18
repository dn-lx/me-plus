BEGIN;
DO $$ DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();r jsonb;rid uuid;sid uuid;day date;title text;BEGIN
 PERFORM set_config('test.lifecycle_a',a::text,true);PERFORM set_config('test.lifecycle_b',b::text,true);
 INSERT INTO auth.users(id,raw_user_meta_data) VALUES(a,'{"timezone":"Europe/Berlin"}'),(b,'{"timezone":"Europe/Berlin"}');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 r:=public.save_meplus_routine(jsonb_build_object('request_id',gen_random_uuid(),'title','Native lifecycle snapshot','domain','personal','normal_duration_minutes',20,'schedule',jsonb_build_object('type','daily','timezone','Europe/Berlin','window_start','06:00','window_end','22:00')));
 rid:=(r->>'routine_id')::uuid;sid:=(r->>'schedule_id')::uuid;
 PERFORM set_config('test.lifecycle_routine',rid::text,true);PERFORM set_config('test.lifecycle_schedule',sid::text,true);
 FOR day IN SELECT generate_series('2026-10-10'::date,'2026-10-14'::date,'1 day')::date LOOP
 PERFORM private.meplus_materialize_native_day(a,(day+time '10:00') AT TIME ZONE 'Europe/Berlin');
 END LOOP;
 -- Historical action snapshots must survive definition edits and disablement.
 UPDATE public.routines SET title='Future definition',normal_duration_minutes=60,active=false WHERE id=rid;
 UPDATE public.routine_schedules SET enabled=false WHERE id=sid;
 SELECT id::text INTO title FROM public.actions WHERE user_id=a AND due_at='2026-10-11T20:00:00Z';
 PERFORM public.record_meplus_action_decision(title::uuid,'completed');
 SELECT id::text INTO title FROM public.actions WHERE user_id=a AND due_at='2026-10-12T20:00:00Z';
 PERFORM public.record_meplus_action_decision(title::uuid,'partial');
 SELECT id::text INTO title FROM public.actions WHERE user_id=a AND due_at='2026-10-13T20:00:00Z';
 PERFORM public.record_meplus_action_decision(title::uuid,'skipped');
 -- A surfaced native occurrence is explicitly protected.
 UPDATE public.actions SET surface_provider='external_fixture',surface_state='pending' WHERE user_id=a AND due_at='2026-10-14T20:00:00Z';
 -- Manual overdue tasks and unmarked legacy routine records stay untouched.
 INSERT INTO public.actions(user_id,origin,domain,title,priority,status,due_at) VALUES(a,'manual','personal','Overdue manual','should','planned','2026-01-01T12:00:00Z'),(a,'routine','personal','Unmarked legacy','should','planned','2026-01-01T12:00:00Z');
END $$;
-- An event write failure must roll back both action expiry and occurrence state.
CREATE FUNCTION private.test_reject_native_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.event_type='expired' THEN RAISE EXCEPTION 'test expiry failure' USING ERRCODE='P0001'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER test_reject_native_expiry BEFORE INSERT ON public.action_events FOR EACH ROW EXECUTE FUNCTION private.test_reject_native_expiry();
DO $$ DECLARE a uuid:=current_setting('test.lifecycle_a')::uuid;BEGIN
 BEGIN
  PERFORM private.meplus_reconcile_native_occurrences(a,'2026-10-16T08:00:00Z');
  RAISE EXCEPTION 'expected expiry insertion failure' USING ERRCODE='P0002';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.actions WHERE user_id=a AND status='expired') OR EXISTS(SELECT 1 FROM public.routine_events WHERE user_id=a AND status='missed') THEN RAISE EXCEPTION 'failed expiry leaked partial writes';END IF;
END $$;
DROP TRIGGER test_reject_native_expiry ON public.action_events;
DROP FUNCTION private.test_reject_native_expiry();
DO $$ DECLARE r jsonb;a uuid:=current_setting('test.lifecycle_a')::uuid;BEGIN
 r:=private.meplus_reconcile_native_occurrences(a,'2026-10-16T01:00:00Z');
 IF r->>'reason'<>'protected_sleep' OR (SELECT count(*) FROM public.actions WHERE user_id=a AND status='expired')<>0 THEN RAISE EXCEPTION 'sleep cleanup wrote data';END IF;
 r:=private.meplus_reconcile_native_occurrences(a,'2026-10-16T08:00:00Z');
 IF r->>'expired'<>'1' OR r->>'missed'<>'1' THEN RAISE EXCEPTION 'disabled routine cleanup failed: %',r;END IF;
 r:=private.meplus_reconcile_native_occurrences(a,'2026-10-16T08:00:00Z');
 IF r->>'expired'<>'0' OR (SELECT count(*) FROM public.action_events WHERE user_id=a AND event_type='expired')<>1 THEN RAISE EXCEPTION 'expiry not idempotent';END IF;
 IF (SELECT count(*) FROM public.actions WHERE user_id=a AND status IN ('completed','partial','skipped'))<>3 THEN RAISE EXCEPTION 'execution history overwritten';END IF;
 IF EXISTS(SELECT 1 FROM public.actions WHERE user_id=a AND routine_event_id IS NOT NULL AND (title<>'Native lifecycle snapshot' OR estimated_minutes<>20)) THEN RAISE EXCEPTION 'snapshot changed with definition';END IF;
 IF (SELECT count(*) FROM public.actions WHERE user_id=a AND status='planned')<>3 THEN RAISE EXCEPTION 'external/manual/legacy changed';END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.lifecycle_a'),true);
DO $$ DECLARE r jsonb;BEGIN
 r:=public.get_meplus_workspace(ARRAY['tasks'],50);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'tasks') a WHERE a->>'status'='partial') THEN RAISE EXCEPTION 'elapsed native partial remained in active tray';END IF;
 IF jsonb_array_length(r->'tasks')<>3 THEN RAISE EXCEPTION 'manual/legacy/external task hidden';END IF;
 r:=public.get_meplus_backend_readiness();
 IF r->>'backend_configuration_ready'<>'true' OR r->>'evidence_scope'<>'current_database_configuration' THEN RAISE EXCEPTION 'backend configuration evidence mismatch: %',r;END IF;
 BEGIN PERFORM private.meplus_reconcile_native_occurrences(current_setting('test.lifecycle_b')::uuid,clock_timestamp());RAISE EXCEPTION 'client ran private cleanup';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.lifecycle_b'),true);
DO $$ DECLARE r jsonb;BEGIN
 r:=public.get_meplus_workspace(ARRAY['tasks'],50);IF jsonb_array_length(r->'tasks')<>0 THEN RAISE EXCEPTION 'cross-user workspace leak';END IF;
END $$;
RESET ROLE;
UPDATE public.profiles SET timezone='UTC' WHERE id=current_setting('test.lifecycle_b')::uuid;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb;BEGIN
 r:=public.get_meplus_backend_readiness();IF r->>'backend_configuration_ready'<>'false' OR r#>>'{owner_profile,native_clock_timezone_covered}'<>'false' THEN RAISE EXCEPTION 'unsupported UTC clock coverage claimed';END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.get_meplus_backend_readiness();RAISE EXCEPTION 'anon readiness';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
RESET ROLE;
ROLLBACK;
