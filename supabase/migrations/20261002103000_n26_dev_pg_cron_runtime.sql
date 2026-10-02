-- Make Supabase pg_cron the single authoritative N26 provider-sync clock.
-- The worker remains the secret-protected Netlify dev background function.
-- Runtime secret value is provisioned separately in Supabase Vault and Netlify env;
-- it is intentionally not stored in this migration.

create or replace function private.invoke_n26_provider_sync_dev()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = 'meplus_n26_dev_scheduler_secret'
  limit 1;

  if v_secret is null or length(v_secret) < 32 then
    raise exception 'Missing or invalid meplus_n26_dev_scheduler_secret in Supabase Vault';
  end if;

  select net.http_post(
    url := 'https://dev--me-plus-personal-intelligence.netlify.app/.netlify/functions/n26-sync-background',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-me-plus-scheduler-secret', v_secret
    ),
    timeout_milliseconds := 5000
  )
  into v_request_id;

  return v_request_id;
end;
$function$;

revoke all on function private.invoke_n26_provider_sync_dev()
  from public, anon, authenticated;
grant execute on function private.invoke_n26_provider_sync_dev()
  to service_role;

select cron.schedule(
  'meplus-n26-provider-sync-dev',
  '15 */6 * * *',
  $cron$select private.invoke_n26_provider_sync_dev();$cron$
);

insert into private.scheduler_runtime_registry (
  user_id,
  scheduler_key,
  runtime_kind,
  runtime_ref,
  cron_jobname,
  enabled_expected,
  heartbeat_required,
  expected_cadence_minutes,
  allowed_lateness_minutes,
  source_note,
  health_mode,
  active_timezone
)
select
  p.id,
  'n26_provider_sync',
  'pg_cron',
  'supabase:pg_cron:meplus-n26-provider-sync-dev',
  'meplus-n26-provider-sync-dev',
  true,
  true,
  360,
  60,
  'Supabase pg_cron is the single authoritative N26 sync clock. It invokes the secret-protected Netlify dev background worker every six hours; production is not required for the current single-user runtime.',
  'cadence',
  'Europe/Berlin'
from public.profiles p
on conflict (user_id, scheduler_key)
do update set
  runtime_kind = excluded.runtime_kind,
  runtime_ref = excluded.runtime_ref,
  cron_jobname = excluded.cron_jobname,
  enabled_expected = excluded.enabled_expected,
  heartbeat_required = excluded.heartbeat_required,
  expected_cadence_minutes = excluded.expected_cadence_minutes,
  allowed_lateness_minutes = excluded.allowed_lateness_minutes,
  source_note = excluded.source_note,
  health_mode = excluded.health_mode,
  active_timezone = excluded.active_timezone,
  updated_at = clock_timestamp();

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
    for update
  loop
    v_new_policy :=
      (v_old.policy - 'scheduled_function')
      || jsonb_build_object(
        'policy_version', '1.29-draft',
        'source_spec_version', '1.29-draft',
        'runtime_host', 'supabase_pg_cron',
        'runtime_environment', 'dev',
        'authoritative_clock', 'supabase_pg_cron',
        'cron_jobname', 'meplus-n26-provider-sync-dev',
        'worker_function', 'n26-sync-background',
        'worker_target', 'https://dev--me-plus-personal-intelligence.netlify.app',
        'single_authoritative_sync_clock', true,
        'production_required', false,
        'credentials_location', 'netlify_functions_env_plus_supabase_vault'
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
      '1.29-draft',
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
