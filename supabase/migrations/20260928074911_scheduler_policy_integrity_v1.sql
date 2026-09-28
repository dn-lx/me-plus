
create or replace function public.get_scheduler_policy(
  p_user_id uuid,
  p_scheduler_key text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with active as (
    select policy_key, policy_version, policy_schema_version, policy_checksum,
           source_document_id, source_document_title, effective_from, policy,
           (policy_checksum is not null and policy_checksum = md5(policy::text)) as checksum_valid
    from public.scheduler_policies
    where user_id=p_user_id
      and status='active'
      and (
        policy_key='global'
        or (p_scheduler_key is not null and policy_key=p_scheduler_key)
      )
  )
  select jsonb_build_object(
    'global', (
      select jsonb_build_object(
        'policy_key',policy_key,
        'policy_version',policy_version,
        'policy_schema_version',policy_schema_version,
        'policy_checksum',policy_checksum,
        'checksum_valid',checksum_valid,
        'source_document_id',source_document_id,
        'source_document_title',source_document_title,
        'effective_from',effective_from,
        'policy',policy
      )
      from active where policy_key='global'
    ),
    'scheduler', (
      select jsonb_build_object(
        'policy_key',policy_key,
        'policy_version',policy_version,
        'policy_schema_version',policy_schema_version,
        'policy_checksum',policy_checksum,
        'checksum_valid',checksum_valid,
        'source_document_id',source_document_id,
        'source_document_title',source_document_title,
        'effective_from',effective_from,
        'policy',policy
      )
      from active where policy_key=p_scheduler_key
    )
  );
$$;

revoke all on function public.get_scheduler_policy(uuid,text)
from public, anon, authenticated;
grant execute on function public.get_scheduler_policy(uuid,text)
to service_role;
