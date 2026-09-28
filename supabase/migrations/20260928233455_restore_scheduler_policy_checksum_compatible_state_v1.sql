update public.scheduler_policies
set policy = jsonb_set(
      policy #- '{external_dispatch,todoist_worker}',
      '{external_dispatch,todoist_backend_status}',
      '"blocked_until_server_side_adapter_configured"'::jsonb,
      true
    ),
    updated_at=now()
where policy_key='hourly_task_scheduler' and status='active';
