
revoke update on public.actions from authenticated;
grant update (status, version, planned_start, planned_end) on public.actions to authenticated;

revoke update on public.routine_events from authenticated;
grant update (status, selected_version, completed_at, skip_reason) on public.routine_events to authenticated;

-- Profile removal should be handled by an explicit account/data-deletion workflow,
-- not by deleting only the profile row and leaving the auth identity behind.
revoke delete on public.profiles from authenticated;
