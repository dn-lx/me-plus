-- The gateway recommendation read is the user-facing current Guidance projection.
-- A latest noop means no current Guidance; older rows stay in recommendations.
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
  v_dispatch public.scheduler_dispatches%rowtype;
  v_ids jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  select d.*
  into v_dispatch
  from public.scheduler_dispatches d
  where d.user_id=p_user_id
    and d.scheduler_key='hourly_task_scheduler'
    and d.status='completed'
    and d.payload ? 'ai_reasoning'
    and d.payload->'ai_reasoning'->>'decision' in ('noop','recommend')
  order by d.logical_hour desc,d.completed_at desc nulls last,d.created_at desc
  limit 1;

  if not found or v_dispatch.payload->'ai_reasoning'->>'decision'='noop' then
    return '[]'::jsonb;
  end if;

  v_ids := coalesce(v_dispatch.payload->'ai_reasoning'->'recommendation_ids','[]'::jsonb);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',r.id,
        'type',r.recommendation_type,
        'title',r.title,
        'domain',r.domain,
        'feedback',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'decision',f.decision,
              'helpfulness',f.helpfulness,
              'reason_code',f.reason_code,
              'note',f.note,
              'recorded_at',f.recorded_at
            )
            order by f.recorded_at desc
          )
          from public.recommendation_feedback f
          where f.user_id=r.user_id
            and f.recommendation_id=r.id
        ),'[]'::jsonb),
        'priority',r.priority,
        'rationale',r.rationale,
        'confidence',r.confidence,
        'expires_at',r.expires_at,
        'generated_at',r.generated_at,
        'policy_version',r.policy_version,
        'proposed_action',r.proposed_action,
        'guidance_as_of',coalesce(v_dispatch.completed_at,v_dispatch.updated_at,v_dispatch.created_at),
        'guidance_dispatch_id',v_dispatch.id,
        'guidance_logical_hour',v_dispatch.logical_hour
      )
      order by r.priority nulls last,r.generated_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.recommendations r
  where r.user_id=p_user_id
    and r.id::text in (select jsonb_array_elements_text(v_ids))
    and r.domain<>'system'
    and (r.expires_at is null or r.expires_at>clock_timestamp())
  limit greatest(1,least(coalesce(p_limit,20),50));

  return v_result;
end;
$fn$;

revoke all on function public.server_gateway_get_recommendation_history(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.server_gateway_get_recommendation_history(uuid,integer)
  to service_role;
