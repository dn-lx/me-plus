-- Slow two non-core safety-net clocks to once per hour while preserving them.
-- AI reasoning recovery runs at minute 30 during the active planning window.
-- Routine surface cleanup retry runs at minute 30 during its existing candidate windows.

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='meplus-ai-reasoning-worker-retry'),
  schedule := '30 5-19 * * *'
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='meplus-routine-surface-cutoff-retry'),
  schedule := '30 10-11,16-17,22-23 * * *'
);

update private.scheduler_runtime_registry
set source_note='AI child worker is work-driven; recovery cron runs once per hour at minute 30 during the 06:00-21:59 Europe/Berlin planning window.',
    updated_at=clock_timestamp()
where scheduler_key='ai_reasoning_worker';

update private.scheduler_runtime_registry
set source_note='Removal-only retry backstop. Once per hour at minute 30 during CET/CEST cutoff candidate UTC hours, wake only an already-pending/retry routine_surface_cutoff_cleanup dispatch whose external_available_at has elapsed. No planning, creation, rescheduling, completion inference or Catalog reconciliation.',
    updated_at=clock_timestamp()
where scheduler_key='routine_surface_cutoff_retry';
