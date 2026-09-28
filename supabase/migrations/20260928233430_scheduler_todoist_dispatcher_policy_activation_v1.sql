update public.scheduler_policies
set policy = jsonb_set(
      jsonb_set(policy,'{external_dispatch,todoist_backend_status}','"configured_server_side_adapter"'::jsonb,true),
      '{external_dispatch,todoist_worker}','"me-plus-todoist-dispatcher"'::jsonb,true
    ),
    updated_at=now()
where policy_key='hourly_task_scheduler' and status='active';
