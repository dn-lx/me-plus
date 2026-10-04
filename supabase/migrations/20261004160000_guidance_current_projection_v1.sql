-- Me+ Guidance freshness: return only recommendation IDs from the latest
-- completed scheduler reasoning decision; a latest noop returns no guidance.
create or replace function public.server_gateway_get_recommendation_history(
  p_user_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $fn$
declare
  d public.scheduler_dispatches%rowtype;
  ids jsonb;
  result jsonb := '[]'::jsonb;
begin
  select x.* into d
  from public.scheduler_dispatches x
  where x.user_id=p_user_id
    and x.scheduler_key='hourly_task_scheduler'
    and x.status='completed'
    and x.payload ? 'ai_reasoning'
    and x.payload->'ai_reasoning'->>'decision' in ('noop','recommend')
  order by x.logical_hour desc,x.completed_at desc nulls last,x.created_at desc
  limit 1;

  if not found or d.payload->'ai_reasoning'->>'decision'='noop' then
    return '[]'::jsonb;
  end if;

  ids := coalesce(d.payload->'ai_reasoning'->'recommendation_ids','[]'::jsonb);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'type',r.recommendation_type,
    'title',r.title,
    'domain',r.domain,
    'priority',r.priority,
    'rationale',r.rationale,
    'confidence',r.confidence,
    'expires_at',r.expires_at,
    'generated_at',r.generated_at,
    'policy_version',r.policy_version,
    'proposed_action',r.proposed_action,
    'guidance_as_of',coalesce(d.completed_at,d.updated_at,d.created_at),
    'guidance_dispatch_id',d.id,
    'guidance_logical_hour',d.logical_hour
  ) order by r.priority nulls last,r.generated_at desc),'[]'::jsonb)
  into result
  from public.recommendations r
  where r.user_id=p_user_id
    and r.id::text in (select jsonb_array_elements_text(ids))
    and r.domain<>'system'
    and (r.expires_at is null or r.expires_at>clock_timestamp());

  return result;
end;
$fn$;

revoke all on function public.server_gateway_get_recommendation_history(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.server_gateway_get_recommendation_history(uuid,integer)
  to service_role;
