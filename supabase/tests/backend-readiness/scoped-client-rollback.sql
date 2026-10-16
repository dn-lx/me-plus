BEGIN;
DO $$ DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); BEGIN
 PERFORM set_config('test.client_a',a::text,true); PERFORM set_config('test.client_b',b::text,true);
 INSERT INTO auth.users(id) VALUES(a),(b);
 INSERT INTO public.profiles(id,timezone) VALUES(a,'Europe/Berlin'),(b,'Europe/Berlin') ON CONFLICT(id) DO NOTHING;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.client_a'),true);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.create_meplus_client_token('mcp','Synthetic writable',ARRAY['read_state','create_task','edit_task','reschedule_task','complete_task'],ARRAY['tasks'],1);
 PERFORM set_config('test.client_write',r->>'token',true); PERFORM set_config('test.client_write_id',r->>'token_id',true);
 r:=public.create_meplus_client_token('mcp','Synthetic read only',ARRAY['read_state'],ARRAY['tasks'],1);
 PERFORM set_config('test.client_read',r->>'token',true);PERFORM set_config('test.client_read_id',r->>'token_id',true);
 IF public.list_meplus_client_tokens()::text ~ '(token_hash|meplus_)' THEN RAISE EXCEPTION 'token list exposed credentials'; END IF;
 BEGIN
  PERFORM public.server_execute_meplus_client_tool(current_setting('test.client_write'),'read_state','{}');
  RAISE EXCEPTION 'authenticated caller reached service boundary';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.client_b'),true);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.create_meplus_client_token('mcp','Synthetic B',ARRAY['read_state','edit_task','complete_task'],ARRAY['tasks'],1);
 PERFORM set_config('test.client_b_token',r->>'token',true);
 BEGIN PERFORM public.revoke_meplus_client_token(current_setting('test.client_write_id')::uuid);RAISE EXCEPTION 'cross-user revoke'; EXCEPTION WHEN no_data_found THEN NULL;END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE r jsonb; task uuid; req uuid:=gen_random_uuid(); key text:=current_setting('test.client_write'); BEGIN
 r:=public.server_execute_meplus_client_tool('meplus_'||repeat('0',64),'read_state','{}');
 IF r->>'error'<>'unauthorized' THEN RAISE EXCEPTION 'invalid token accepted'; END IF;
 r:=public.server_execute_meplus_client_tool(key,'create_task',jsonb_build_object('request_id',req,'title','Scoped synthetic task'));
 IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'create tool failed: %',r; END IF;
 task:=(r->>'action_id')::uuid;PERFORM set_config('test.client_task',task::text,true);
 r:=public.server_execute_meplus_client_tool(key,'create_task',jsonb_build_object('request_id',req,'title','Scoped synthetic task'));
 IF r->>'replayed'<>'true' OR (r->>'action_id')::uuid<>task THEN RAISE EXCEPTION 'client replay failed'; END IF;
 r:=public.server_execute_meplus_client_tool(current_setting('test.client_read'),'create_task',jsonb_build_object('request_id',gen_random_uuid(),'title','Denied'));
 IF r->>'error'<>'forbidden' THEN RAISE EXCEPTION 'read-only key wrote'; END IF;
 r:=public.server_execute_meplus_client_tool(key,'read_state','{"sections":["health"]}');
 IF r->>'error'<>'forbidden' THEN RAISE EXCEPTION 'health scope escaped'; END IF;
 r:=public.server_execute_meplus_client_tool(key,'read_state',jsonb_build_object('user_id',current_setting('test.client_b')));
 IF r->>'error'<>'invalid_arguments' THEN RAISE EXCEPTION 'owner argument accepted'; END IF;
 r:=public.server_execute_meplus_client_tool(current_setting('test.client_b_token'),'edit_task',jsonb_build_object('request_id',gen_random_uuid(),'action_id',task,'title','Denied'));
 IF r->>'error'<>'not_found' THEN RAISE EXCEPTION 'cross-user tool edit'; END IF;
 r:=public.server_execute_meplus_client_tool(key,'edit_task',jsonb_build_object('request_id',gen_random_uuid(),'action_id',task,'title','Edited scoped task'));
 IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'edit failed: %',r; END IF;
 r:=public.server_execute_meplus_client_tool(key,'read_state','{"sections":["tasks"],"limit":10}');
 IF jsonb_array_length(r->'tasks')<>1 OR r#>>'{tasks,0,title}'<>'Edited scoped task' THEN RAISE EXCEPTION 'bounded own state failed'; END IF;
 req:=gen_random_uuid();
 PERFORM set_config('test.complete_request',req::text,true);
 r:=public.server_execute_meplus_client_tool(key,'complete_task',jsonb_build_object('request_id',req,'action_id',task,'status','partial'));
 IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'partial failed'; END IF;
 r:=public.server_execute_meplus_client_tool(key,'complete_task',jsonb_build_object('request_id',gen_random_uuid(),'action_id',task,'status','completed'));
 IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'completion failed'; END IF;
 r:=public.server_execute_meplus_client_tool(key,'complete_task',jsonb_build_object('request_id',req,'action_id',task,'status','partial'));
 IF r->>'replayed'<>'true' THEN RAISE EXCEPTION 'partial request identity lost'; END IF;
 IF auth.uid() IS NOT NULL OR auth.jwt()->>'role'<>'service_role' THEN RAISE EXCEPTION 'request identity leaked after execution'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.actions WHERE id=current_setting('test.client_task')::uuid AND user_id=current_setting('test.client_a')::uuid AND status='completed') THEN RAISE EXCEPTION 'retry changed completion or owner'; END IF;
 IF (SELECT count(*) FROM private.meplus_client_audit WHERE NOT ok)<4 THEN RAISE EXCEPTION 'denied requests not audited'; END IF;
 INSERT INTO private.meplus_client_rate_windows VALUES(current_setting('test.client_read_id')::uuid,date_trunc('minute',clock_timestamp()),120)
 ON CONFLICT(token_id,bucket) DO UPDATE SET hits=120;
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.server_execute_meplus_client_tool(current_setting('test.client_read'),'read_state','{}');
 IF r->>'error'<>'rate_limited' THEN RAISE EXCEPTION 'rate limit failed'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.client_a'),true);
SELECT public.revoke_meplus_client_token(current_setting('test.client_write_id')::uuid);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.server_execute_meplus_client_tool(current_setting('test.client_write'),'read_state','{}');
 IF r->>'error'<>'unauthorized' THEN RAISE EXCEPTION 'revoked token accepted'; END IF;
END $$;
RESET ROLE;
UPDATE private.meplus_client_tokens SET expires_at=clock_timestamp()-interval '1 second' WHERE id=current_setting('test.client_read_id')::uuid;
SET LOCAL ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.server_execute_meplus_client_tool(current_setting('test.client_read'),'read_state','{}');
 IF r->>'error'<>'unauthorized' THEN RAISE EXCEPTION 'expired token accepted'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
