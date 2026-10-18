create trigger source_sync_run_guard_before_insert before insert on public.source_sync_runs
for each row execute function private.guard_source_sync_run_insert();
create trigger source_sync_run_release_after_terminal after update of status on public.source_sync_runs
for each row execute function private.release_source_sync_lease();
