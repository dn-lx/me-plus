
create or replace function public.start_hourly_scheduler_run_with_catalog(
  p_user_id uuid,
  p_automation_id text,
  p_logical_hour timestamptz,
  p_trigger_mode text default 'scheduled'
)
returns jsonb
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_logical_hour timestamptz;
  v_last_catalog timestamptz;
  v_interval_minutes integer := 60;
  v_project_id text;
  v_refresh_due boolean := false;
begin
  v_logical_hour := (
    date_trunc(
      'hour',
      (p_logical_hour at time zone 'Europe/Berlin') + interval '30 minutes'
    ) at time zone 'Europe/Berlin'
  );

  select
    nullif(value->>'last_sync_at','')::timestamptz,
    coalesce((value->>'sync_interval_minutes')::integer,60),
    nullif(value->>'project_id','')
  into v_last_catalog,v_interval_minutes,v_project_id
  from public.preferences
  where user_id=p_user_id
    and scope='action_engine'
    and key='todoist_catalog_surface'
  limit 1;

  v_refresh_due :=
    v_project_id is not null
    and (
      v_last_catalog is null
      or v_logical_hour >= v_last_catalog + make_interval(mins => v_interval_minutes)
    );

  if v_refresh_due then
    perform public.record_scheduler_signal(
      p_user_id,
      'todoist_catalog_refresh_due',
      'todoist_catalog_items',
      null,
      jsonb_build_object(
        'logical_hour',v_logical_hour,
        'catalog_project_id',v_project_id,
        'reason','Hourly scheduler owns catalog reconciliation.'
      ),
      'todoist_catalog_refresh_due:' ||
        to_char(v_logical_hour at time zone 'Europe/Berlin','YYYY-MM-DD"T"HH24:00')
    );
  end if;

  return public.start_hourly_scheduler_run(
    p_user_id,p_automation_id,v_logical_hour,p_trigger_mode
  ) || jsonb_build_object(
    'catalog_refresh_due',v_refresh_due,
    'catalog_last_sync_at',v_last_catalog,
    'catalog_sync_interval_minutes',v_interval_minutes
  );
end;
$$;

revoke all on function public.start_hourly_scheduler_run_with_catalog(uuid,text,timestamptz,text)
from public,anon,authenticated;
grant execute on function public.start_hourly_scheduler_run_with_catalog(uuid,text,timestamptz,text)
to service_role;
