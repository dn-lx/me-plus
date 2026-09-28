
create unique index if not exists financial_accounts_active_source_external_ref_uidx
  on public.financial_accounts(data_source_id, external_account_ref)
  where active and external_account_ref is not null;

create unique index if not exists source_sync_runs_one_running_per_source_uidx
  on public.source_sync_runs(data_source_id)
  where status='running';

create or replace function public.get_daily_bank_snapshot(
  p_user_id uuid,
  p_as_of timestamptz default now()
)
returns jsonb
language sql
stable
set search_path to 'public','pg_temp'
as $function$
with source as (
  select ds.*
  from public.data_sources ds
  where ds.user_id=p_user_id
    and (
      lower(ds.provider) like '%enable-banking%'
      or lower(ds.display_name) like '%n26%'
      or lower(ds.kind) like '%bank%'
    )
  order by ds.updated_at desc
  limit 1
),
latest_sync as (
  select sr.*
  from public.source_sync_runs sr
  join source s on s.id=sr.data_source_id
  where sr.user_id=p_user_id
  order by sr.started_at desc
  limit 1
),
consent as (
  select c.*
  from public.consents c
  join source s on s.id=c.data_source_id
  where c.user_id=p_user_id
  order by c.updated_at desc
  limit 1
),
accounts as (
  select fa.*
  from public.financial_accounts fa
  join source s on s.id=fa.data_source_id
  where fa.user_id=p_user_id
    and fa.active
    and coalesce(fa.metadata->>'qualityStatus','') <> 'corrected_superseded'
  order by fa.balance_as_of desc nulls last, fa.updated_at desc
),
primary_account as (
  select *
  from accounts
  limit 1
),
transactions as (
  select ft.*
  from public.financial_transactions ft
  join accounts a on a.id=ft.financial_account_id
  where ft.user_id=p_user_id
    and coalesce(ft.metadata->>'qualityStatus','') <> 'corrected_superseded'
  order by ft.booked_at desc, ft.updated_at desc
  limit 20
)
select jsonb_build_object(
  'as_of',p_as_of,
  'source',(
    select case when s.id is null then null else jsonb_build_object(
      'id',s.id,
      'provider',s.provider,
      'display_name',s.display_name,
      'kind',s.kind,
      'status',s.status,
      'last_sync_at',s.last_sync_at,
      'consent_valid_until',s.metadata->>'consentValidUntil'
    ) end
    from source s
  ),
  'freshness',(
    select case when s.id is null then jsonb_build_object(
      'status','missing_source',
      'hours_since_sync',null,
      'stale_over_36h',true
    ) else jsonb_build_object(
      'status',case
        when s.last_sync_at is null then 'never_synced'
        when p_as_of - s.last_sync_at > interval '36 hours' then 'stale'
        else 'fresh'
      end,
      'hours_since_sync',case when s.last_sync_at is null then null
        else round((extract(epoch from (p_as_of-s.last_sync_at))/3600.0)::numeric,1) end,
      'stale_over_36h',coalesce(p_as_of - s.last_sync_at > interval '36 hours',true)
    ) end
    from source s
  ),
  'latest_sync',(
    select case when x.id is null then null else jsonb_build_object(
      'id',x.id,
      'status',x.status,
      'started_at',x.started_at,
      'finished_at',x.finished_at,
      'records_seen',x.records_seen,
      'records_created',x.records_created,
      'records_updated',x.records_updated,
      'error_code',x.error_code
    ) end
    from latest_sync x
  ),
  'consent',(
    select case when c.id is null then null else jsonb_build_object(
      'status',c.status,
      'purpose',c.purpose,
      'granted_at',c.granted_at,
      'revoked_at',c.revoked_at,
      'valid_until',coalesce(c.metadata->>'validUntil',c.metadata->>'consentValidUntil')
    ) end
    from consent c
  ),
  'account',(
    select case when a.id is null then null else jsonb_build_object(
      'id',a.id,
      'account_type',a.account_type,
      'display_name',a.display_name,
      'currency',a.currency,
      'current_balance',a.current_balance,
      'available_balance',a.available_balance,
      'balance_as_of',a.balance_as_of
    ) end
    from primary_account a
  ),
  'accounts',(
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,
      'account_type',a.account_type,
      'display_name',a.display_name,
      'currency',a.currency,
      'current_balance',a.current_balance,
      'available_balance',a.available_balance,
      'balance_as_of',a.balance_as_of
    ) order by a.balance_as_of desc nulls last,a.updated_at desc),'[]'::jsonb)
    from accounts a
  ),
  'recent_transactions',(
    select coalesce(jsonb_agg(jsonb_build_object(
      'financial_account_id',t.financial_account_id,
      'booked_at',t.booked_at,
      'amount',t.amount,
      'currency',t.currency,
      'merchant',t.merchant,
      'description',t.description,
      'category',t.category,
      'transaction_type',t.transaction_type
    ) order by t.booked_at desc,t.updated_at desc),'[]'::jsonb)
    from transactions t
  )
);
$function$;
