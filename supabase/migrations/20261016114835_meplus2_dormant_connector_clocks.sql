-- Prepared clocks stay disabled until provider authorization and a fresh-data
-- ingestion run have succeeded. Never restore V1 AI or Todoist polling.
DO $clock$
DECLARE job bigint;
BEGIN
 job:=cron.schedule('meplus2-google-calendar','*/15 4-20 * * *','SELECT private.wake_meplus_calendar_worker();');
 PERFORM cron.alter_job(job_id:=job,active:=false);
 job:=cron.schedule('meplus2-healthsync','5 4,6,8,10,12,14,16,18,20 * * *','SELECT private.wake_meplus_healthsync_worker();');
 PERFORM cron.alter_job(job_id:=job,active:=false);
 job:=cron.schedule('meplus2-n26','15 7 * * *','SELECT private.invoke_n26_provider_sync_dev();');
 PERFORM cron.alter_job(job_id:=job,active:=false);
END;
$clock$;
