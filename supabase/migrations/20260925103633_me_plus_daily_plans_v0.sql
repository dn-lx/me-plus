
create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  personal_state_snapshot_id uuid not null,
  plan_date date not null,
  timezone text not null,
  engine_version text not null,
  status text not null default 'active' check (status in ('active','superseded','completed')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date, engine_version),
  constraint daily_plans_state_owner_fkey
    foreign key (personal_state_snapshot_id, user_id)
    references public.personal_state_snapshots(id, user_id)
);

create index daily_plans_user_date_idx on public.daily_plans(user_id, plan_date desc);
create index daily_plans_state_user_idx on public.daily_plans(personal_state_snapshot_id, user_id);

alter table public.actions add column daily_plan_id uuid;
alter table public.daily_plans add constraint daily_plans_id_user_id_key unique (id,user_id);
alter table public.actions add constraint actions_daily_plan_owner_fkey
  foreign key (daily_plan_id,user_id) references public.daily_plans(id,user_id) on delete set null;
create index actions_daily_plan_user_idx on public.actions(daily_plan_id,user_id);

create trigger daily_plans_updated before update on public.daily_plans
for each row execute function public.set_updated_at();

alter table public.daily_plans enable row level security;
create policy daily_plans_select on public.daily_plans for select to authenticated
using ((select auth.uid()) = user_id);

grant select on public.daily_plans to authenticated;
grant select,insert,update,delete on public.daily_plans to service_role;
revoke all on public.daily_plans from anon;
