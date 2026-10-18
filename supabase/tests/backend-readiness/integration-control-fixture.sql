-- Local-only services. These fixtures never reach a provider or contain keys.
CREATE SCHEMA cron; CREATE SCHEMA net; CREATE SCHEMA vault;
CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text UNIQUE,active boolean NOT NULL,command text);
INSERT INTO cron.job VALUES(1,'meplus2-google-calendar',false,''),(2,'meplus2-healthsync',false,''),(3,'meplus2-n26',false,'');
CREATE FUNCTION cron.alter_job(job_id bigint,schedule text DEFAULT NULL,command text DEFAULT NULL,database text DEFAULT NULL,username text DEFAULT NULL,active boolean DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$ BEGIN UPDATE cron.job j SET active=coalesce(alter_job.active,j.active),command=coalesce(alter_job.command,j.command) WHERE jobid=job_id; END $$;
CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz DEFAULT now());
INSERT INTO vault.decrypted_secrets VALUES('meplus_project_url','https://abcdefghijklmnopqrst.supabase.co',now()),('meplus_calendar_wake_secret','synthetic_calendar_secret_not_real',now()),('meplus_healthsync_wake_secret','synthetic_health_secret_not_real',now());
CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 5000) RETURNS bigint LANGUAGE sql AS $$ SELECT 9001::bigint $$;
CREATE FUNCTION private.wake_meplus_calendar_worker() RETURNS bigint LANGUAGE sql AS $$ SELECT 9002::bigint $$;
CREATE FUNCTION private.wake_meplus_healthsync_worker() RETURNS bigint LANGUAGE sql AS $$ SELECT 9003::bigint $$;
CREATE FUNCTION private.invoke_n26_provider_sync_dev() RETURNS bigint LANGUAGE sql AS $$ SELECT 9004::bigint $$;
CREATE TABLE public.source_sync_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,data_source_id uuid NOT NULL,started_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz,status text NOT NULL);
ALTER TABLE public.data_sources ADD PRIMARY KEY(id);
