create table if not exists private.todoist_guidance_surface_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  project_id text not null,
  last_sync_at timestamptz,
  last_status text,
  last_error jsonb,
  last_recommendation_ids jsonb not null default '[]'::jsonb,
  last_todoist_task_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint todoist_guidance_surface_state_status_check
    check (last_status is null or last_status in ('completed','failed'))
);

alter table private.todoist_guidance_surface_state enable row level security;
revoke all on private.todoist_guidance_surface_state from public, anon, authenticated;

create or replace function public.server_get_todoist_guidance_surface_context(
  p_user_id uuid,
  p_as_of timestamptz default clock_timestamp()
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with cfg as (
    select sp.policy->'todoist_guidance_surface' as surface
    from public.scheduler_policies sp
    where sp.user_id=p_user_id
      and sp.policy_key='guidance_scheduler'
      and sp.status='active'
      and sp.effective_from <= p_as_of
    order by sp.effective_from desc, sp.created_at desc
    limit 1
  ),
  active_goal_domains as (
    select distinct lower(g.domain) as domain
    from public.goals g
    where g.user_id=p_user_id and g.status='active'
  ),
  recs as (
    select
      r.*,
      case
        when r.confidence='insufficient_data'
          or lower(btrim(r.title)) ~ '^(input gap|watch\b|watch:)'
          then 'watch_notice'
        when exists (
          select 1 from active_goal_domains gd where gd.domain=lower(r.domain)
        )
          then 'goal_guidance'
        else 'everyday_guidance'
      end as section_key,
      'guidance:' || md5(lower(btrim(r.domain)) || E'\x1f' || lower(btrim(r.title))) as surface_key
    from public.recommendations r
    where r.user_id=p_user_id
      and r.recommendation_type='guidance'
      and r.generated_at <= p_as_of
      and (r.expires_at is null or r.expires_at > p_as_of)
    order by r.priority asc nulls last, r.generated_at desc
    limit 3
  )
  select jsonb_build_object(
    'as_of',p_as_of,
    'enabled',coalesce((cfg.surface->>'enabled')::boolean,false),
    'project_id',cfg.surface->>'project_id',
    'project_name',coalesce(cfg.surface->>'project_name','Me+ Guidance'),
    'sections',coalesce(cfg.surface->'sections','{}'::jsonb),
    'legacy_seed_task_ids',coalesce(cfg.surface->'legacy_seed_task_ids','[]'::jsonb),
    'managed_marker',coalesce(cfg.surface->>'managed_marker','**Me+ Guidance key:**'),
    'advisory_only',coalesce((cfg.surface->>'advisory_only')::boolean,true),
    'no_due_dates',coalesce((cfg.surface->>'no_due_dates')::boolean,true),
    'recommendations',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',r.id,
          'surface_key',r.surface_key,
          'section_key',r.section_key,
          'section_id',cfg.surface#>>array['sections',r.section_key,'id'],
          'section_name',cfg.surface#>>array['sections',r.section_key,'name'],
          'title',r.title,
          'domain',r.domain,
          'rationale',r.rationale,
          'confidence',r.confidence,
          'priority',r.priority,
          'generated_at',r.generated_at,
          'expires_at',r.expires_at,
          'minimum_action',nullif(r.proposed_action->>'minimum_action',''),
          'instructions',nullif(r.proposed_action->>'instructions',''),
          'action_priority',nullif(r.proposed_action->>'action_priority',''),
          'risk_class',nullif(r.proposed_action->>'risk_class','')
        )
        order by r.priority asc nulls last, r.generated_at desc
      )
      from recs r
    ),'[]'::jsonb)
  )
  from cfg;
$function$;

revoke execute on function public.server_get_todoist_guidance_surface_context(uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.server_get_todoist_guidance_surface_context(uuid,timestamptz)
  to service_role;

create or replace function public.server_record_todoist_guidance_surface_sync(
  p_user_id uuid,
  p_project_id text,
  p_status text,
  p_recommendation_ids jsonb default '[]'::jsonb,
  p_todoist_task_ids jsonb default '[]'::jsonb,
  p_error jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row private.todoist_guidance_surface_state%rowtype;
begin
  if p_status not in ('completed','failed') then
    raise exception 'invalid guidance surface sync status';
  end if;

  insert into private.todoist_guidance_surface_state(
    user_id,project_id,last_sync_at,last_status,last_error,
    last_recommendation_ids,last_todoist_task_ids,created_at,updated_at
  )
  values(
    p_user_id,p_project_id,clock_timestamp(),p_status,p_error,
    coalesce(p_recommendation_ids,'[]'::jsonb),
    coalesce(p_todoist_task_ids,'[]'::jsonb),
    clock_timestamp(),clock_timestamp()
  )
  on conflict (user_id) do update
  set project_id=excluded.project_id,
      last_sync_at=excluded.last_sync_at,
      last_status=excluded.last_status,
      last_error=excluded.last_error,
      last_recommendation_ids=excluded.last_recommendation_ids,
      last_todoist_task_ids=excluded.last_todoist_task_ids,
      updated_at=clock_timestamp()
  returning * into v_row;

  return jsonb_build_object(
    'user_id',v_row.user_id,
    'project_id',v_row.project_id,
    'last_sync_at',v_row.last_sync_at,
    'last_status',v_row.last_status,
    'last_recommendation_ids',v_row.last_recommendation_ids,
    'last_todoist_task_ids',v_row.last_todoist_task_ids
  );
end;
$function$;

revoke execute on function public.server_record_todoist_guidance_surface_sync(uuid,text,text,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.server_record_todoist_guidance_surface_sync(uuid,text,text,jsonb,jsonb,jsonb)
  to service_role;

create or replace function private.wake_todoist_on_guidance_refresh()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.scheduler_key='guidance_scheduler'
     and new.status='completed'
     and (
       old.status is distinct from new.status
       or old.completed_at is distinct from new.completed_at
       or old.payload->'ai_reasoning' is distinct from new.payload->'ai_reasoning'
     ) then
    begin
      perform private.wake_meplus_todoist_dispatcher();
    exception when others then
      perform public.record_scheduler_signal(
        new.user_id,
        'guidance_todoist_wake_failed',
        'scheduler_dispatches',
        new.id,
        jsonb_build_object(
          'dispatch_id',new.id,
          'error_type','guidance_todoist_wake_failed',
          'message',sqlerrm
        ),
        'guidance_todoist_wake_failed:' || new.id::text
      );
    end;
  end if;
  return new;
end;
$function$;

drop trigger if exists scheduler_dispatch_guidance_todoist_wake on public.scheduler_dispatches;
create trigger scheduler_dispatch_guidance_todoist_wake
after update on public.scheduler_dispatches
for each row execute function private.wake_todoist_on_guidance_refresh();
