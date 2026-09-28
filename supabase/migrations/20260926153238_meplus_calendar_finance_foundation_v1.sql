create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid references public.data_sources(id) on delete set null,
  external_event_id text,
  calendar_name text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text,
  location_text text,
  event_type text,
  status text not null default 'confirmed',
  busy boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create unique index calendar_events_source_external_uidx on public.calendar_events(data_source_id, external_event_id) where external_event_id is not null;

create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  block_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source_calendar_event_id uuid references public.calendar_events(id) on delete set null,
  flexibility text not null default 'fixed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source_id uuid references public.data_sources(id) on delete set null,
  provider text,
  external_account_ref text,
  account_type text not null,
  display_name text not null,
  currency text not null default 'EUR',
  current_balance numeric(18,2),
  available_balance numeric(18,2),
  balance_as_of timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  data_source_id uuid references public.data_sources(id) on delete set null,
  external_transaction_id text,
  booked_at timestamptz not null,
  value_at timestamptz,
  amount numeric(18,2) not null,
  currency text not null default 'EUR',
  merchant text,
  description text,
  category text,
  transaction_type text,
  recurring_candidate boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index financial_transactions_account_external_uidx on public.financial_transactions(financial_account_id, external_transaction_id) where external_transaction_id is not null;

create table public.recurring_financial_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text,
  amount numeric(18,2),
  currency text not null default 'EUR',
  cadence text not null,
  next_due_on date,
  essential boolean not null default false,
  active boolean not null default true,
  source_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lender text,
  debt_type text not null,
  display_name text not null,
  currency text not null default 'EUR',
  original_principal numeric(18,2),
  current_balance numeric(18,2),
  interest_rate numeric(8,5),
  minimum_payment numeric(18,2),
  next_payment_on date,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  as_of timestamptz not null,
  currency text not null default 'EUR',
  total_assets numeric(18,2),
  total_liabilities numeric(18,2),
  cash_available numeric(18,2),
  monthly_income numeric(18,2),
  monthly_committed_expenses numeric(18,2),
  monthly_variable_expenses numeric(18,2),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index calendar_events_user_start_idx on public.calendar_events(user_id, starts_at);
create index time_blocks_user_start_idx on public.time_blocks(user_id, starts_at);
create index financial_accounts_user_idx on public.financial_accounts(user_id);
create index financial_transactions_user_booked_idx on public.financial_transactions(user_id, booked_at desc);
create index recurring_financial_commitments_user_due_idx on public.recurring_financial_commitments(user_id, next_due_on);
create index debts_user_status_idx on public.debts(user_id, status);
create index financial_snapshots_user_asof_idx on public.financial_snapshots(user_id, as_of desc);

create trigger calendar_events_set_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();
create trigger time_blocks_set_updated_at before update on public.time_blocks for each row execute function public.set_updated_at();
create trigger financial_accounts_set_updated_at before update on public.financial_accounts for each row execute function public.set_updated_at();
create trigger financial_transactions_set_updated_at before update on public.financial_transactions for each row execute function public.set_updated_at();
create trigger recurring_financial_commitments_set_updated_at before update on public.recurring_financial_commitments for each row execute function public.set_updated_at();
create trigger debts_set_updated_at before update on public.debts for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;
alter table public.time_blocks enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.recurring_financial_commitments enable row level security;
alter table public.debts enable row level security;
alter table public.financial_snapshots enable row level security;

create policy calendar_events_all on public.calendar_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy time_blocks_all on public.time_blocks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy financial_accounts_all on public.financial_accounts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy financial_transactions_all on public.financial_transactions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy recurring_financial_commitments_all on public.recurring_financial_commitments for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy debts_all on public.debts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy financial_snapshots_all on public.financial_snapshots for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.calendar_events, public.time_blocks, public.financial_accounts, public.financial_transactions, public.recurring_financial_commitments, public.debts, public.financial_snapshots to authenticated, service_role;
revoke all on public.calendar_events, public.time_blocks, public.financial_accounts, public.financial_transactions, public.recurring_financial_commitments, public.debts, public.financial_snapshots from anon;
