alter function public.server_ingest_healthsync_batch(uuid,uuid,jsonb)
  set statement_timeout = '30s';

alter function public.server_ingest_healthsync_batch_v2(uuid,uuid,jsonb)
  set statement_timeout = '30s';
