-- User correction: refresh N26 once per day instead of every six hours.
-- The UTC schedule is deliberately early enough to complete before the
-- 08:00 Europe/Berlin Daily bank info retriever in both CET and CEST.
-- Production is not changed by this migration.

select cron.alter_job(
  job_id := (
    select jobid
    from cron.job
    where jobname = 'meplus-n26-provider-sync-dev'
  ),
  schedule := '15 5 * * *'
);

update private.scheduler_runtime_registry
set expected_cadence_minutes = 1440,
    allowed_lateness_minutes = 60,
    source_note = 'Supabase pg_cron is the single authoritative N26 sync clock. It invokes the secret-protected Netlify dev background worker once daily at 05:15 UTC, before the 08:00 Europe/Berlin bank retriever in both CET and CEST; production is not required for the current single-user runtime.',
    updated_at = clock_timestamp()
where scheduler_key = 'n26_provider_sync';

update public.scheduler_heartbeats
set expected_cadence_minutes = 1440,
    allowed_lateness_minutes = 60,
    updated_at = clock_timestamp()
where scheduler_key = 'n26_provider_sync';

do $policy$
declare
  v_old public.scheduler_policies%rowtype;
  v_new_policy jsonb;
begin
  for v_old in
    select *
    from public.scheduler_policies
    where policy_key = 'n26_provider_sync'
      and status = 'active'
      and policy_version <> '1.30-draft'
    for update
  loop
    v_new_policy :=
      v_old.policy
      || jsonb_build_object(
        'cadence', 'daily',
        'cron_utc', '15 5 * * *',
        'daily_sync_time_utc', '05:15',
        'daily_sync_precedes_bank_retriever', true,
        'policy_version', '1.30-draft',
        'source_spec_version', '1.30-draft',
        'heartbeat', jsonb_build_object(
          'expected_cadence_minutes', 1440,
          'allowed_lateness_minutes', 60
        )
      );

    update public.scheduler_policies
    set status = 'retired',
        updated_at = clock_timestamp()
    where id = v_old.id;

    insert into public.scheduler_policies (
      user_id,
      policy_key,
      policy_version,
      status,
      source_document_id,
      source_document_title,
      effective_from,
      policy,
      supersedes_id,
      policy_schema_version,
      policy_checksum
    )
    values (
      v_old.user_id,
      v_old.policy_key,
      '1.30-draft',
      'active',
      v_old.source_document_id,
      v_old.source_document_title,
      clock_timestamp(),
      v_new_policy,
      v_old.id,
      v_old.policy_schema_version,
      md5(v_new_policy::text)
    );
  end loop;
end;
$policy$;
