-- Current Guidance is a projection of the latest completed reasoning decision.
-- Historical recommendations remain in public.recommendations for audit/learning.
create or replace view public.current_guidance_v1
with (security_invoker=true)
as
with latest as (
  select d.user_id,d.id as dispatch_id,d.logical_hour,
         coalesce(d.completed_at,d.updated_at,d.created_at) as guidance_as_of,
         d.payload->'ai_reasoning'->>'decision' as decision,
         coalesce(d.payload->'ai_reasoning'->'recommendation_ids','[]'::jsonb) as recommendation_ids,
         d.payload->'ai_reasoning'->>'personal_state_snapshot_id' as guidance_personal_state_snapshot_id
  from public.scheduler_dispatches d
  where d.scheduler_key='hourly_task_scheduler'
    and d.status='completed'
    and d.payload ? 'ai_reasoning'
    and d.payload->'ai_reasoning'->>'decision' in ('noop','recommend')
    and not exists (
      select 1 from public.scheduler_dispatches newer
      where newer.user_id=d.user_id
        and newer.scheduler_key='hourly_task_scheduler'
        and newer.status='completed'
        and newer.payload ? 'ai_reasoning'
        and newer.payload->'ai_reasoning'->>'decision' in ('noop','recommend')
        and (newer.logical_hour,newer.completed_at,newer.created_at) >
            (d.logical_hour,d.completed_at,d.created_at)
    )
)
select r.*,l.dispatch_id,l.logical_hour,l.guidance_as_of,l.guidance_personal_state_snapshot_id
from latest l
join public.recommendations r
  on r.user_id=l.user_id
 and l.decision='recommend'
 and l.recommendation_ids @> jsonb_build_array(r.id::text)
where r.domain<>'system'
  and (r.expires_at is null or r.expires_at>clock_timestamp());

revoke all on public.current_guidance_v1 from public,anon,authenticated;
grant select on public.current_guidance_v1 to service_role;
