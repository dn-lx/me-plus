create or replace function private.record_healthsync_auth_failure_heartbeat()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_error text;
begin
  if new.provider = 'google-drive-healthsync'
     and new.status = 'active'
     and coalesce(new.metadata->>'authConfigured','true') = 'false'
     and (old.metadata->>'lastAuthCheckedAt') is distinct from (new.metadata->>'lastAuthCheckedAt') then
    v_error := coalesce(new.metadata->>'lastAuthError','healthsync_drive_auth_failed');

    perform public.record_scheduler_heartbeat(
      new.user_id,
      'healthsync_drive_ingestion',
      'invoked',
      null,
      null,
      30,
      10,
      null,
      'supabase:healthsync_drive_ingestion'
    );

    perform public.record_scheduler_heartbeat(
      new.user_id,
      'healthsync_drive_ingestion',
      'failed',
      null,
      jsonb_build_object(
        'error_code','healthsync_drive_auth_failed',
        'message',left(v_error,700),
        'source','data_sources_auth_failure_trigger'
      ),
      30,
      10,
      null,
      'supabase:healthsync_drive_ingestion'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_healthsync_auth_failure_heartbeat on public.data_sources;

create trigger trg_healthsync_auth_failure_heartbeat
after update of metadata on public.data_sources
for each row
when (old.provider = 'google-drive-healthsync'::text)
execute function private.record_healthsync_auth_failure_heartbeat();
