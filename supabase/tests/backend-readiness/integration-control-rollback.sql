BEGIN;
-- On the hosted schema, reuse the sole owner's pending configuration inside
-- this rollback transaction; a second owner must never bypass the runtime gate.
DO $$ DECLARE a uuid;b uuid:=gen_random_uuid();sid uuid;BEGIN
 SELECT id INTO a FROM public.profiles ORDER BY created_at LIMIT 1;
 IF a IS NULL THEN a:=gen_random_uuid();INSERT INTO auth.users(id) VALUES(a);END IF;
 INSERT INTO auth.users(id) VALUES(b);
 SELECT id INTO sid FROM public.data_sources WHERE user_id=a AND provider='google-calendar-supabase' LIMIT 1;
 IF sid IS NULL THEN
 sid:=gen_random_uuid();
 INSERT INTO public.data_sources(id,user_id,kind,provider,display_name,status,metadata) VALUES(sid,a,'calendar','google-calendar-supabase','Synthetic calendar','pending_authorization',jsonb_build_object('ingestFrom',clock_timestamp()));
 END IF;
 UPDATE public.data_sources SET metadata=metadata||'{"authConfigured":true}'::jsonb WHERE id=sid;
 PERFORM set_config('test.integration_a',a::text,true);PERFORM set_config('test.integration_b',b::text,true);PERFORM set_config('test.integration_source',sid::text,true);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.integration_b'),true);
DO $$ BEGIN
 IF (public.get_meplus_integration_status()#>>'{providers,1,source_configured}')::boolean THEN RAISE EXCEPTION 'status leaked another source'; END IF;
 BEGIN PERFORM public.set_meplus_integration_state('google-calendar-supabase','pause',gen_random_uuid());RAISE EXCEPTION 'cross-user pause';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.request_meplus_integration_probe('google-calendar-supabase',gen_random_uuid());RAISE EXCEPTION 'cross-user probe';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM public.server_record_meplus_integration_probe(gen_random_uuid(),'google-calendar-supabase',true);RAISE EXCEPTION 'forged auth';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.integration_a'),true);
DO $$ DECLARE r jsonb;p uuid:=gen_random_uuid(); BEGIN
 r:=public.set_meplus_integration_state('google-calendar-supabase','start',gen_random_uuid());IF r->>'error'<>'authorization_required' THEN RAISE EXCEPTION 'started without auth';END IF;
 r:=public.request_meplus_integration_probe('google-calendar-supabase',p);IF r->>'status'<>'queued' THEN RAISE EXCEPTION 'probe not queued';END IF;
 PERFORM set_config('test.integration_probe',p::text,true);
 r:=public.request_meplus_integration_probe('google-calendar-supabase',p);IF r->>'replayed'<>'true' THEN RAISE EXCEPTION 'probe replay failed';END IF;
 r:=public.request_meplus_integration_probe('google-calendar-supabase',gen_random_uuid());IF r->>'error'<>'rate_limited' THEN RAISE EXCEPTION 'probe rate limit';END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF public.server_record_meplus_integration_probe(current_setting('test.integration_probe')::uuid,'google-drive-healthsync',true) THEN RAISE EXCEPTION 'provider mismatch accepted';END IF;
 IF NOT public.server_record_meplus_integration_probe(current_setting('test.integration_probe')::uuid,'google-calendar-supabase',true) THEN RAISE EXCEPTION 'auth proof failed';END IF;
 IF public.server_record_meplus_integration_probe(current_setting('test.integration_probe')::uuid,'google-calendar-supabase',false) THEN RAISE EXCEPTION 'proof replay accepted';END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE private.meplus_integration_probes SET checked_at=clock_timestamp()-interval '16 minutes' WHERE id=current_setting('test.integration_probe')::uuid;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb;BEGIN
 r:=public.set_meplus_integration_state('google-calendar-supabase','start',gen_random_uuid());IF r->>'error'<>'authorization_required' THEN RAISE EXCEPTION 'stale auth proof accepted';END IF;
END $$;
RESET ROLE;
UPDATE private.meplus_integration_probes SET checked_at=clock_timestamp() WHERE id=current_setting('test.integration_probe')::uuid;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb;req uuid:=gen_random_uuid();BEGIN
 r:=public.set_meplus_integration_state('google-calendar-supabase','start',req);IF r->>'status'<>'awaiting_first_sync' THEN RAISE EXCEPTION 'start failed';END IF;
 PERFORM set_config('test.integration_start',req::text,true);
 r:=public.set_meplus_integration_state('google-calendar-supabase','enable_clock',gen_random_uuid());IF r->>'error'<>'successful_sync_required' THEN RAISE EXCEPTION 'clock enabled before sync';END IF;
END $$;
RESET ROLE;
INSERT INTO public.source_sync_runs(user_id,data_source_id,status,started_at,finished_at) VALUES(current_setting('test.integration_a')::uuid,current_setting('test.integration_source')::uuid,'completed',clock_timestamp(),clock_timestamp());
UPDATE public.data_sources SET last_sync_at=clock_timestamp() WHERE id=current_setting('test.integration_source')::uuid;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb;BEGIN
 r:=public.set_meplus_integration_state('google-calendar-supabase','enable_clock',gen_random_uuid());IF r->>'status'<>'active' THEN RAISE EXCEPTION 'clock did not enable';END IF;
 r:=public.set_meplus_integration_state('google-calendar-supabase','pause',gen_random_uuid());IF r->>'status'<>'paused' THEN RAISE EXCEPTION 'pause failed';END IF;
 r:=public.set_meplus_integration_state('google-calendar-supabase','start',current_setting('test.integration_start')::uuid);IF r->>'replayed'<>'true' THEN RAISE EXCEPTION 'start receipt lost';END IF;
END $$;
RESET ROLE;
DO $$ DECLARE a uuid:=current_setting('test.integration_a')::uuid;sid uuid:=current_setting('test.integration_source')::uuid;p uuid:=gen_random_uuid();BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='meplus2-google-calendar' AND active) THEN RAISE EXCEPTION 'paused clock still active';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.data_sources WHERE id=sid AND status='paused') THEN RAISE EXCEPTION 'retry restarted paused source';END IF;
 INSERT INTO private.meplus_integration_probes(id,user_id,source_id,provider,expires_at) VALUES(p,a,sid,'google-calendar-supabase',clock_timestamp()-interval '1 minute');
 PERFORM set_config('test.integration_expired',p::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.data_sources WHERE user_id=a AND provider='enable-banking') THEN
 INSERT INTO public.data_sources(user_id,kind,provider,display_name,status) VALUES(a,'bank_account_feed','enable-banking','Synthetic N26','pending_authorization');
 END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb;BEGIN
 r:=public.set_meplus_integration_state('enable-banking','start',gen_random_uuid());IF r->>'error'<>'deployment_pending' THEN RAISE EXCEPTION 'N26 bypassed rollout gate';END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ BEGIN IF public.server_record_meplus_integration_probe(current_setting('test.integration_expired')::uuid,'google-calendar-supabase',true) THEN RAISE EXCEPTION 'expired nonce accepted';END IF;END $$;
RESET ROLE;
-- A second owner's source must block global-account activation; pausing A
-- must not switch off a clock belonging to an active B source.
INSERT INTO public.data_sources(user_id,kind,provider,display_name,status,metadata) VALUES(current_setting('test.integration_b')::uuid,'calendar','google-calendar-supabase','Synthetic B calendar','active','{}');
SELECT cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='meplus2-google-calendar'),active:=true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.set_meplus_integration_state('google-calendar-supabase','start',gen_random_uuid());RAISE EXCEPTION 'multi-owner activation';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.set_meplus_integration_state('google-calendar-supabase','pause',gen_random_uuid());
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='meplus2-google-calendar' AND active) THEN RAISE EXCEPTION 'pause disabled another owner clock';END IF;
 IF private.run_meplus_integration_clock('google-calendar-supabase') IS NOT NULL THEN RAISE EXCEPTION 'global worker processed multiple owners';END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.get_meplus_integration_status();RAISE EXCEPTION 'anon status';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
RESET ROLE;
ROLLBACK;
