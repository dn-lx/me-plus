
create table public.scheduler_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null,
  source_table text,
  source_id uuid,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  status text not null default 'new'
    check (status in ('new','claimed','processed','ignored')),
  claimed_at timestamptz,
  processed_at timestamptz,
  processing_note text,
  created_at timestamptz not null default now()
);

create unique index scheduler_signals_user_dedupe_uidx
  on public.scheduler_signals(user_id, dedupe_key)
  where dedupe_key is not null;

create index scheduler_signals_user_status_time_idx
  on public.scheduler_signals(user_id, status, occurred_at desc);

alter table public.scheduler_signals enable row level security;

create policy scheduler_signals_select
on public.scheduler_signals
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.scheduler_signals from anon, authenticated;
grant select on public.scheduler_signals to authenticated;
grant all on public.scheduler_signals to service_role;

comment on table public.scheduler_signals is
'Event-driven orchestration signal queue/log for Me+ Task schduler. Signals are structured backend facts; they do not themselves imply an AI run or user notification.';

create table public.scheduler_run_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduler_name text not null default 'Task schduler',
  triggered_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger_mode text not null default 'scheduled'
    check (trigger_mode in ('scheduled','signal','manual','backstop')),
  gate_version text,
  needs_ai boolean,
  reasons jsonb not null default '[]'::jsonb,
  signal_ids jsonb not null default '[]'::jsonb,
  sources_checked jsonb not null default '[]'::jsonb,
  changes_made jsonb not null default '[]'::jsonb,
  status text not null default 'started'
    check (status in ('started','no_op','completed','failed')),
  error jsonb,
  created_at timestamptz not null default now()
);

create index scheduler_run_log_user_triggered_idx
  on public.scheduler_run_log(user_id, triggered_at desc);

alter table public.scheduler_run_log enable row level security;

create policy scheduler_run_log_select
on public.scheduler_run_log
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.scheduler_run_log from anon, authenticated;
grant select on public.scheduler_run_log to authenticated;
grant all on public.scheduler_run_log to service_role;

comment on table public.scheduler_run_log is
'Observability history for deterministic gate checks and deeper Task schduler runs.';

create or replace function public.record_scheduler_signal(
  p_user_id uuid,
  p_signal_type text,
  p_source_table text default null,
  p_source_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.scheduler_signals(
    user_id, signal_type, source_table, source_id, payload, dedupe_key
  )
  values (
    p_user_id, p_signal_type, p_source_table, p_source_id,
    coalesce(p_payload,'{}'::jsonb), p_dedupe_key
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null
  do update set
    occurred_at = greatest(public.scheduler_signals.occurred_at, now()),
    payload = excluded.payload,
    status = case
      when public.scheduler_signals.status in ('processed','ignored') then 'new'
      else public.scheduler_signals.status
    end,
    claimed_at = case
      when public.scheduler_signals.status in ('processed','ignored') then null
      else public.scheduler_signals.claimed_at
    end,
    processed_at = case
      when public.scheduler_signals.status in ('processed','ignored') then null
      else public.scheduler_signals.processed_at
    end
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_scheduler_signal(uuid,text,text,uuid,jsonb,text)
from public, anon, authenticated;
grant execute on function public.record_scheduler_signal(uuid,text,text,uuid,jsonb,text)
to service_role;

create or replace function public.get_pending_scheduler_signals(
  p_user_id uuid,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'signal_type', signal_type,
      'source_table', source_table,
      'source_id', source_id,
      'occurred_at', occurred_at,
      'payload', payload
    )
    order by occurred_at
  ), '[]'::jsonb)
  from (
    select *
    from public.scheduler_signals
    where user_id = p_user_id
      and status = 'new'
    order by occurred_at
    limit greatest(1, least(coalesce(p_limit,20),100))
  ) s;
$$;

revoke all on function public.get_pending_scheduler_signals(uuid,integer)
from public, anon, authenticated;
grant execute on function public.get_pending_scheduler_signals(uuid,integer)
to service_role;

create or replace function public.get_active_goals(
  p_user_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',id,'domain',domain,'title',title,'description',description,
      'priority',priority,'target_date',target_date,'constraints',constraints
    )
    order by priority desc, created_at
  ), '[]'::jsonb)
  from public.goals
  where user_id=p_user_id
    and status='active'
    and archived_at is null;
$$;

revoke all on function public.get_active_goals(uuid)
from public, anon, authenticated;
grant execute on function public.get_active_goals(uuid)
to service_role;

create or replace function public.get_recent_actions(
  p_user_id uuid,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',id,'domain',domain,'origin',origin,'title',title,'priority',priority,
      'version',version,'status',status,'estimated_minutes',estimated_minutes,
      'available_from',available_from,'due_at',due_at,'planned_start',planned_start,
      'planned_end',planned_end,'reason',reason,'constraint_flags',constraint_flags,
      'updated_at',updated_at
    )
    order by updated_at desc
  ), '[]'::jsonb)
  from (
    select *
    from public.actions
    where user_id=p_user_id
    order by updated_at desc
    limit greatest(1, least(coalesce(p_limit,50),200))
  ) a;
$$;

revoke all on function public.get_recent_actions(uuid,integer)
from public, anon, authenticated;
grant execute on function public.get_recent_actions(uuid,integer)
to service_role;

create or replace function public.get_recommendation_history(
  p_user_id uuid,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',r.id,'type',r.recommendation_type,'domain',r.domain,
      'generated_at',r.generated_at,'expires_at',r.expires_at,'title',r.title,
      'rationale',r.rationale,'confidence',r.confidence,'priority',r.priority,
      'proposed_action',r.proposed_action,'policy_version',r.policy_version,
      'feedback',coalesce(f.feedback,'[]'::jsonb)
    )
    order by r.generated_at desc
  ), '[]'::jsonb)
  from (
    select *
    from public.recommendations
    where user_id=p_user_id
    order by generated_at desc
    limit greatest(1, least(coalesce(p_limit,30),100))
  ) r
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'decision',decision,'helpfulness',helpfulness,'reason_code',reason_code,
        'note',note,'recorded_at',recorded_at
      )
      order by recorded_at desc
    ) as feedback
    from public.recommendation_feedback rf
    where rf.user_id=p_user_id and rf.recommendation_id=r.id
  ) f on true;
$$;

revoke all on function public.get_recommendation_history(uuid,integer)
from public, anon, authenticated;
grant execute on function public.get_recommendation_history(uuid,integer)
to service_role;

create or replace function public.get_due_routines(
  p_user_id uuid,
  p_as_of timestamptz default now()
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(public.me_scheduler_probe(p_user_id,p_as_of)->'due_routines','[]'::jsonb);
$$;

revoke all on function public.get_due_routines(uuid,timestamptz)
from public, anon, authenticated;
grant execute on function public.get_due_routines(uuid,timestamptz)
to service_role;

create or replace function public.build_personal_state(
  p_user_id uuid,
  p_as_of timestamptz default now()
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'schema_version','v1',
    'as_of',p_as_of,
    'profile',(
      select jsonb_build_object('timezone',timezone,'locale',locale)
      from public.profiles where id=p_user_id
    ),
    'summary',(
      select to_jsonb(s) - 'user_id'
      from public.current_personal_state_inputs s
      where s.user_id=p_user_id
    ),
    'active_goals',public.get_active_goals(p_user_id),
    'due_routines',public.get_due_routines(p_user_id,p_as_of),
    'open_actions',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',id,'title',title,'domain',domain,'priority',priority,'status',status,
        'available_from',available_from,'due_at',due_at,'estimated_minutes',estimated_minutes,
        'reason',reason
      ) order by
        case priority when 'must' then 1 when 'should' then 2 else 3 end,
        due_at nulls last, created_at
      ),'[]'::jsonb)
      from public.actions
      where user_id=p_user_id
        and status in ('proposed','planned','available','in_progress','partial')
    ),
    'calendar_next_24h',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',id,'title',title,'starts_at',starts_at,'ends_at',ends_at,
        'busy',busy,'status',status
      ) order by starts_at),'[]'::jsonb)
      from public.calendar_events
      where user_id=p_user_id
        and starts_at < p_as_of + interval '24 hours'
        and ends_at > p_as_of
        and status <> 'cancelled'
    ),
    'pending_scheduler_signals',public.get_pending_scheduler_signals(p_user_id,20)
  );
$$;

revoke all on function public.build_personal_state(uuid,timestamptz)
from public, anon, authenticated;
grant execute on function public.build_personal_state(uuid,timestamptz)
to service_role;

create index if not exists routine_schedules_user_routine_type_idx
  on public.routine_schedules(user_id, routine_id, schedule_type);

create index if not exists routine_events_user_occurrence_status_idx
  on public.routine_events(user_id, occurrence_date, status);

create index if not exists recommendations_user_generated_idx
  on public.recommendations(user_id, generated_at desc);

comment on function public.build_personal_state(uuid,timestamptz) is
'Bounded deterministic v1 Personal State builder for Me+ intelligence orchestration.';
comment on function public.get_due_routines(uuid,timestamptz) is
'Bounded due-routine read contract. V1 delegates to the scheduler probe and therefore currently reflects configured daily-window support.';
