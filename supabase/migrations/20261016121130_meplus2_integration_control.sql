-- Fixed connector controls. Provider credentials remain in Vault/Edge Secrets.
CREATE TABLE private.meplus_integration_runtime (
 provider text PRIMARY KEY CHECK(provider IN ('google-calendar-supabase','google-drive-healthsync','enable-banking')),
 jobname text UNIQUE NOT NULL, deployed boolean NOT NULL DEFAULT false, worker_revision text NOT NULL,
 cadence_minutes integer NOT NULL CHECK(cadence_minutes>0)
);
INSERT INTO private.meplus_integration_runtime VALUES
 ('google-calendar-supabase','meplus2-google-calendar',true,'calendar-v18-probe-v1',15),
 ('google-drive-healthsync','meplus2-healthsync',true,'healthsync-v27-probe-v1',120),
 ('enable-banking','meplus2-n26',false,'n26-history-guard-deployment-pending',1440);
CREATE TABLE private.meplus_integration_probes (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 source_id uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
 provider text NOT NULL REFERENCES private.meplus_integration_runtime(provider),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '2 minutes',
 checked_at timestamptz, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','authorized','authorization_required')),
 network_request_id bigint
);
CREATE INDEX meplus_integration_probes_owner_idx ON private.meplus_integration_probes(user_id,provider,created_at DESC);
CREATE INDEX meplus_integration_probes_source_idx ON private.meplus_integration_probes(source_id);
CREATE INDEX meplus_integration_probes_provider_idx ON private.meplus_integration_probes(provider);
CREATE TABLE private.meplus_integration_activation (
 source_id uuid PRIMARY KEY REFERENCES public.data_sources(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 started_at timestamptz, paused_at timestamptz, clock_enabled_at timestamptz
);
CREATE INDEX meplus_integration_activation_owner_idx ON private.meplus_integration_activation(user_id);
CREATE TABLE private.meplus_integration_control_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 provider text NOT NULL, operation text NOT NULL, request_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX meplus_integration_control_events_owner_idx ON private.meplus_integration_control_events(user_id,recorded_at DESC);
ALTER TABLE private.meplus_integration_runtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.meplus_integration_probes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.meplus_integration_activation ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.meplus_integration_control_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.meplus_integration_runtime,private.meplus_integration_probes,private.meplus_integration_activation,private.meplus_integration_control_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.request_meplus_integration_probe(p_provider text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=auth.uid(); s public.data_sources%rowtype; prior private.meplus_integration_probes%rowtype;
 endpoint text; secret_name text; header_name text; project_url text; wake text; rid bigint;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_provider IS NULL OR p_provider NOT IN ('google-calendar-supabase','google-drive-healthsync') OR p_request_id IS NULL THEN RAISE EXCEPTION 'unsupported probe' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('meplus:integration:'||p_provider,0));
 SELECT * INTO prior FROM private.meplus_integration_probes WHERE id=p_request_id;
 IF FOUND THEN
  IF prior.user_id<>u OR prior.provider<>p_provider THEN RAISE EXCEPTION 'request identity conflict' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('ok',true,'probe_id',prior.id,'status',CASE WHEN prior.status='queued' AND prior.expires_at<clock_timestamp() THEN 'timed_out' ELSE prior.status END,'replayed',true);
 END IF;
 IF (SELECT count(*) FROM public.data_sources WHERE provider=p_provider AND user_id=u)<>1 THEN RAISE EXCEPTION 'one configured source required' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM public.data_sources WHERE provider=p_provider AND user_id<>u) THEN RAISE EXCEPTION 'multi-owner connector requires separate credentials' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM private.meplus_integration_probes WHERE user_id=u AND provider=p_provider AND created_at>clock_timestamp()-interval '1 minute') THEN RETURN jsonb_build_object('ok',false,'error','rate_limited'); END IF;
 SELECT * INTO s FROM public.data_sources WHERE provider=p_provider AND user_id=u FOR UPDATE;
 SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name='meplus_project_url' ORDER BY created_at DESC LIMIT 1;
 IF p_provider='google-calendar-supabase' THEN endpoint:='meplus-google-calendar-sync';secret_name:='meplus_calendar_wake_secret';header_name:='x-meplus-calendar-wake-secret';
 ELSE endpoint:='me-plus-healthsync-drive';secret_name:='meplus_healthsync_wake_secret';header_name:='x-meplus-healthsync-wake-secret'; END IF;
 SELECT decrypted_secret INTO wake FROM vault.decrypted_secrets WHERE name=secret_name ORDER BY created_at DESC LIMIT 1;
 IF project_url IS NULL OR project_url !~ '^https://[a-z0-9]{20}\.supabase\.co/?$' OR length(coalesce(wake,''))<16 THEN RETURN jsonb_build_object('ok',false,'error','runtime_unconfigured'); END IF;
 INSERT INTO private.meplus_integration_probes(id,user_id,source_id,provider) VALUES(p_request_id,u,s.id,p_provider);
 rid:=net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/'||endpoint,
  headers:=jsonb_build_object('Content-Type','application/json',header_name,wake),body:=jsonb_build_object('mode','auth_probe','probe_id',p_request_id),timeout_milliseconds:=15000);
 UPDATE private.meplus_integration_probes SET network_request_id=rid WHERE id=p_request_id;
 RETURN jsonb_build_object('ok',true,'probe_id',p_request_id,'status','queued','replayed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.request_meplus_integration_probe(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_meplus_integration_probe(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.server_record_meplus_integration_probe(p_probe_id uuid,p_provider text,p_authorized boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE probe private.meplus_integration_probes%rowtype;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server role required' USING ERRCODE='42501'; END IF;
 IF p_authorized IS NULL THEN RETURN false; END IF;
 SELECT * INTO probe FROM private.meplus_integration_probes WHERE id=p_probe_id AND provider=p_provider FOR UPDATE;
 IF NOT FOUND OR probe.status<>'queued' OR probe.expires_at<clock_timestamp() THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.data_sources WHERE id=probe.source_id AND user_id=probe.user_id AND provider=probe.provider) THEN RETURN false; END IF;
 UPDATE private.meplus_integration_probes SET status=CASE WHEN p_authorized THEN 'authorized' ELSE 'authorization_required' END,checked_at=clock_timestamp() WHERE id=p_probe_id;
 RETURN true;
END;$fn$;
REVOKE ALL ON FUNCTION public.server_record_meplus_integration_probe(uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_record_meplus_integration_probe(uuid,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION private.run_meplus_integration_clock(p_provider text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE owner_id uuid; zone text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('meplus:integration:'||p_provider,0));
 IF p_provider IS NULL OR NOT EXISTS(SELECT 1 FROM private.meplus_integration_runtime WHERE provider=p_provider AND deployed) THEN RETURN NULL; END IF;
 -- Existing workers use one server OAuth account per provider. Fail closed if
 -- another owner is configured; do not run a global worker across owners.
 IF (SELECT count(DISTINCT user_id) FROM public.data_sources WHERE provider=p_provider)<>1 THEN RETURN NULL; END IF;
 SELECT s.user_id,p.timezone INTO owner_id,zone FROM public.data_sources s JOIN public.profiles p ON p.id=s.user_id
 JOIN private.meplus_integration_activation a ON a.source_id=s.id AND a.user_id=s.user_id
 WHERE s.provider=p_provider AND s.status='active' AND a.paused_at IS NULL AND a.clock_enabled_at IS NOT NULL LIMIT 1;
 IF NOT FOUND OR (clock_timestamp() AT TIME ZONE zone)::time<time '06:00' OR (clock_timestamp() AT TIME ZONE zone)::time>=time '22:00' THEN RETURN NULL; END IF;
 IF p_provider='google-calendar-supabase' THEN RETURN private.wake_meplus_calendar_worker();
 ELSIF p_provider='google-drive-healthsync' THEN RETURN private.wake_meplus_healthsync_worker();
 ELSIF p_provider='enable-banking' THEN RETURN private.invoke_n26_provider_sync_dev(); END IF;
 RETURN NULL;
END;$fn$;
REVOKE ALL ON FUNCTION private.run_meplus_integration_clock(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.set_meplus_integration_state(p_provider text,p_mode text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=auth.uid(); runtime private.meplus_integration_runtime%rowtype; s public.data_sources%rowtype;
 probe private.meplus_integration_probes%rowtype; activation private.meplus_integration_activation%rowtype;
 result jsonb; op text; job bigint; rid bigint;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('pause','start','enable_clock') OR p_request_id IS NULL THEN RAISE EXCEPTION 'invalid control' USING ERRCODE='22023'; END IF;
 SELECT * INTO runtime FROM private.meplus_integration_runtime WHERE provider=p_provider;
 IF NOT FOUND THEN RAISE EXCEPTION 'unsupported integration' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('meplus:integration:'||p_provider,0));
 op:='integration:'||p_provider||':'||p_mode;
 SELECT r.result INTO result FROM private.meplus_request_receipts r WHERE user_id=u AND operation=op AND request_id=p_request_id;
 IF FOUND THEN RETURN result||jsonb_build_object('replayed',true); END IF;
 IF (SELECT count(*) FROM public.data_sources WHERE provider=p_provider AND user_id=u)<>1 THEN RAISE EXCEPTION 'one configured source required' USING ERRCODE='P0002'; END IF;
 SELECT * INTO s FROM public.data_sources WHERE provider=p_provider AND user_id=u FOR UPDATE;
 SELECT jobid INTO job FROM cron.job WHERE jobname=runtime.jobname;
 IF p_mode='pause' THEN
  UPDATE public.data_sources SET status='paused' WHERE id=s.id AND user_id=u;
  INSERT INTO private.meplus_integration_activation(source_id,user_id,paused_at) VALUES(s.id,u,clock_timestamp())
  ON CONFLICT(source_id) DO UPDATE SET paused_at=excluded.paused_at,clock_enabled_at=NULL;
  IF job IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.data_sources WHERE provider=p_provider AND user_id<>u AND status='active') THEN PERFORM cron.alter_job(job_id:=job,active:=false); END IF;
  result:=jsonb_build_object('ok',true,'provider',p_provider,'status','paused','replayed',false);
 ELSE
  IF NOT runtime.deployed THEN RETURN jsonb_build_object('ok',false,'error','deployment_pending'); END IF;
  IF EXISTS(SELECT 1 FROM public.data_sources WHERE provider=p_provider AND user_id<>u) THEN RAISE EXCEPTION 'multi-owner connector requires separate credentials' USING ERRCODE='42501'; END IF;
  SELECT * INTO probe FROM private.meplus_integration_probes WHERE source_id=s.id AND user_id=u AND provider=p_provider ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND OR probe.status<>'authorized' OR probe.checked_at<clock_timestamp()-interval '15 minutes' THEN RETURN jsonb_build_object('ok',false,'error','authorization_required'); END IF;
  IF s.metadata->>'ingestFrom' IS NULL OR (s.metadata->>'ingestFrom')::timestamptz IS NULL THEN RETURN jsonb_build_object('ok',false,'error','history_cutoff_required'); END IF;
  IF p_mode='start' THEN
   UPDATE public.data_sources SET status='active' WHERE id=s.id AND user_id=u;
   INSERT INTO private.meplus_integration_activation(source_id,user_id,started_at) VALUES(s.id,u,clock_timestamp())
   ON CONFLICT(source_id) DO UPDATE SET started_at=excluded.started_at,paused_at=NULL,clock_enabled_at=NULL;
   IF p_provider='google-calendar-supabase' THEN rid:=private.wake_meplus_calendar_worker(); ELSE rid:=private.wake_meplus_healthsync_worker(); END IF;
   IF rid IS NULL THEN RAISE EXCEPTION 'worker unavailable' USING ERRCODE='55000'; END IF;
   result:=jsonb_build_object('ok',true,'provider',p_provider,'status','awaiting_first_sync','replayed',false);
  ELSE
   SELECT * INTO activation FROM private.meplus_integration_activation WHERE source_id=s.id AND user_id=u;
   IF NOT FOUND OR activation.paused_at IS NOT NULL OR activation.started_at IS NULL OR s.status<>'active' OR job IS NULL
    OR s.last_sync_at IS NULL OR s.last_sync_at<activation.started_at OR s.last_sync_at<clock_timestamp()-make_interval(mins=>runtime.cadence_minutes*2)
    OR NOT EXISTS(SELECT 1 FROM public.source_sync_runs WHERE data_source_id=s.id AND user_id=u AND status='completed' AND started_at>=activation.started_at AND finished_at>=started_at)
   THEN RETURN jsonb_build_object('ok',false,'error','successful_sync_required'); END IF;
   UPDATE private.meplus_integration_activation SET clock_enabled_at=clock_timestamp() WHERE source_id=s.id AND user_id=u;
   PERFORM cron.alter_job(job_id:=job,active:=true);
   result:=jsonb_build_object('ok',true,'provider',p_provider,'status','active','replayed',false);
  END IF;
 END IF;
 INSERT INTO private.meplus_request_receipts VALUES(u,op,p_request_id,result,clock_timestamp());
 INSERT INTO private.meplus_integration_control_events(user_id,provider,operation,request_id) VALUES(u,p_provider,p_mode,p_request_id);
 RETURN result;
END;$fn$;
REVOKE ALL ON FUNCTION public.set_meplus_integration_state(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_meplus_integration_state(text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_meplus_integration_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=auth.uid(); items jsonb; agents jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('provider',r.provider,'deployed',r.deployed,'worker_revision',r.worker_revision,
 'source_configured',s.id IS NOT NULL,'source_status',s.status,'last_sync_at',s.last_sync_at,
 'clock_enabled',coalesce(j.active,false) AND s.status='active' AND a.clock_enabled_at IS NOT NULL AND a.paused_at IS NULL,
 'probe_status',CASE WHEN pr.status='queued' AND pr.expires_at<clock_timestamp() THEN 'timed_out' ELSE pr.status END,
 'probe_checked_at',pr.checked_at,'latest_sync_status',sy.status,
 'readiness',CASE WHEN NOT r.deployed THEN 'deployment_pending' WHEN s.id IS NULL THEN 'not_configured'
 WHEN s.status='paused' THEN 'paused'
 WHEN pr.status='authorization_required' AND (s.last_sync_at IS NULL OR pr.checked_at>=s.last_sync_at) THEN 'authorization_required'
 WHEN a.clock_enabled_at IS NOT NULL AND a.paused_at IS NULL AND s.status='active' THEN CASE WHEN sy.status='failed' THEN 'sync_failed' WHEN s.last_sync_at<clock_timestamp()-make_interval(mins=>r.cadence_minutes*2) THEN 'stale' ELSE 'active' END
 WHEN pr.status IS DISTINCT FROM 'authorized' OR pr.checked_at<clock_timestamp()-interval '15 minutes' THEN 'authorization_required'
 WHEN a.started_at IS NULL OR a.paused_at IS NOT NULL THEN 'ready_to_start'
 WHEN s.last_sync_at IS NULL OR s.last_sync_at<a.started_at THEN 'awaiting_first_sync'
 WHEN sy.status='failed' THEN 'sync_failed' WHEN a.clock_enabled_at IS NULL THEN 'ready_to_enable_clock'
 WHEN s.last_sync_at<clock_timestamp()-make_interval(mins=>r.cadence_minutes*2) THEN 'stale' ELSE 'active' END) ORDER BY r.provider),'[]') INTO items
 FROM private.meplus_integration_runtime r
 LEFT JOIN LATERAL(SELECT * FROM public.data_sources WHERE user_id=u AND provider=r.provider ORDER BY created_at LIMIT 1)s ON true
 LEFT JOIN private.meplus_integration_activation a ON a.source_id=s.id AND a.user_id=u
 LEFT JOIN cron.job j ON j.jobname=r.jobname
 LEFT JOIN LATERAL(SELECT * FROM private.meplus_integration_probes WHERE user_id=u AND source_id=s.id ORDER BY created_at DESC LIMIT 1)pr ON true
 LEFT JOIN LATERAL(SELECT status FROM public.source_sync_runs WHERE user_id=u AND data_source_id=s.id ORDER BY started_at DESC LIMIT 1)sy ON true;
 SELECT coalesce(jsonb_agg(jsonb_build_object('client',c.client,'active_token_count',(SELECT count(*) FROM private.meplus_client_tokens t WHERE t.user_id=u AND t.client=c.client AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp()),'tool_access_verified',EXISTS(SELECT 1 FROM private.meplus_client_audit a JOIN private.meplus_client_tokens t ON t.id=a.token_id WHERE a.user_id=u AND a.ok AND t.user_id=u AND t.client=c.client AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp()))),'[]') INTO agents FROM (VALUES('mcp'),('letta'),('n8n'))c(client);
 RETURN jsonb_build_object('contract','meplus-integrations-v1','as_of',clock_timestamp(),'providers',items,'agent_access',agents,
 'health_connect',jsonb_build_object('configured',EXISTS(SELECT 1 FROM public.data_sources WHERE user_id=u AND provider='health-connect'),'last_sync_at',(SELECT max(last_sync_at) FROM public.data_sources WHERE user_id=u AND provider='health-connect'),'device_verification_required',true),
 'optional_runtime_policy','Letta/n8n optional; Langfuse export disabled pending privacy gates; Temporal deferred');
END;$fn$;
REVOKE ALL ON FUNCTION public.get_meplus_integration_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_meplus_integration_status() TO authenticated;

DO $clock$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM private.meplus_integration_runtime LOOP
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname=r.jobname) THEN
   PERFORM cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname=r.jobname),command:=format('SELECT private.run_meplus_integration_clock(%L);',r.provider));
  END IF;
 END LOOP;
END;$clock$;
