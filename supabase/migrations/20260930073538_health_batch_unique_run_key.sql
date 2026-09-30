-- The source-sync guard introduced after health ingestion assigns a minute-bucket
-- runKey to callers that omit one. Two independent, bounded health batches can
-- complete in that minute, so give each health batch its own logical run key.
-- The existing source-wide lease still serializes concurrent work. Raw-event
-- revisions continue to deduplicate a retried HTTP request.
create or replace function private.assign_health_batch_run_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.status = 'running'
     and new.metadata->>'ingestion' = 'me-plus-health-v4-atomic' then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'syncPurpose', 'health_ingestion_batch',
        'runKey', 'health_batch:' || new.id::text
      );
  end if;
  return new;
end;
$function$;

revoke all on function private.assign_health_batch_run_key()
  from public, anon, authenticated;

-- PostgreSQL fires same-kind triggers in name order. This runs before the
-- source_sync_run_guard_before_insert trigger when that guard is installed.
drop trigger if exists a_health_batch_run_key_before_insert
  on public.source_sync_runs;
create trigger a_health_batch_run_key_before_insert
  before insert on public.source_sync_runs
  for each row execute function private.assign_health_batch_run_key();
