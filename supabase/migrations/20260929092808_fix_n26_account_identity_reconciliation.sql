alter table public.financial_accounts
  add column if not exists provider_account_identity_hash text;

comment on column public.financial_accounts.provider_account_identity_hash is
  'Stable provider-supplied account identity used to reconcile the same financial account across reconnect/session UID rotation.';

create unique index if not exists financial_accounts_provider_identity_uidx
  on public.financial_accounts (user_id, data_source_id, provider_account_identity_hash)
  where provider_account_identity_hash is not null;

do $$
declare
  v_mismatch_count integer;
  v_deleted_count integer;
begin
  select count(*)
    into v_mismatch_count
  from public.financial_accounts stale_account
  join public.financial_accounts canonical_account
    on canonical_account.id =
       case
         when stale_account.metadata->>'supersededByAccountId'
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         then (stale_account.metadata->>'supersededByAccountId')::uuid
         else null
       end
  join public.financial_transactions stale_tx
    on stale_tx.financial_account_id = stale_account.id
  where stale_account.provider = 'n26'
    and stale_account.active = false
    and stale_account.metadata->>'qualityStatus' = 'corrected_superseded'
    and not exists (
      select 1
      from public.financial_transactions canonical_tx
      where canonical_tx.financial_account_id = canonical_account.id
        and canonical_tx.user_id = stale_tx.user_id
        and canonical_tx.data_source_id is not distinct from stale_tx.data_source_id
        and canonical_tx.external_transaction_id is not distinct from stale_tx.external_transaction_id
        and canonical_tx.booked_at = stale_tx.booked_at
        and canonical_tx.value_at is not distinct from stale_tx.value_at
        and canonical_tx.amount = stale_tx.amount
        and canonical_tx.currency = stale_tx.currency
        and canonical_tx.merchant is not distinct from stale_tx.merchant
        and canonical_tx.description is not distinct from stale_tx.description
        and canonical_tx.category is not distinct from stale_tx.category
        and canonical_tx.transaction_type is not distinct from stale_tx.transaction_type
        and canonical_tx.recurring_candidate = stale_tx.recurring_candidate
    );

  if v_mismatch_count > 0 then
    raise exception
      'BNK-003 repair aborted: % superseded N26 normalized transaction rows do not have an exact canonical counterpart',
      v_mismatch_count;
  end if;

  with deleted as (
    delete from public.financial_transactions stale_tx
    using public.financial_accounts stale_account,
          public.financial_accounts canonical_account
    where stale_tx.financial_account_id = stale_account.id
      and stale_account.provider = 'n26'
      and stale_account.active = false
      and stale_account.metadata->>'qualityStatus' = 'corrected_superseded'
      and canonical_account.id =
          case
            when stale_account.metadata->>'supersededByAccountId'
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (stale_account.metadata->>'supersededByAccountId')::uuid
            else null
          end
      and exists (
        select 1
        from public.financial_transactions canonical_tx
        where canonical_tx.financial_account_id = canonical_account.id
          and canonical_tx.user_id = stale_tx.user_id
          and canonical_tx.data_source_id is not distinct from stale_tx.data_source_id
          and canonical_tx.external_transaction_id is not distinct from stale_tx.external_transaction_id
          and canonical_tx.booked_at = stale_tx.booked_at
          and canonical_tx.value_at is not distinct from stale_tx.value_at
          and canonical_tx.amount = stale_tx.amount
          and canonical_tx.currency = stale_tx.currency
          and canonical_tx.merchant is not distinct from stale_tx.merchant
          and canonical_tx.description is not distinct from stale_tx.description
          and canonical_tx.category is not distinct from stale_tx.category
          and canonical_tx.transaction_type is not distinct from stale_tx.transaction_type
          and canonical_tx.recurring_candidate = stale_tx.recurring_candidate
      )
    returning stale_tx.id
  )
  select count(*) into v_deleted_count from deleted;

  update public.financial_accounts stale_account
  set metadata =
      stale_account.metadata ||
      jsonb_build_object(
        'normalizedDuplicateRowsRemoved', true,
        'normalizedDuplicateRowsRemovedAt', now(),
        'normalizedDuplicateRowsRemovedCount', v_deleted_count
      ),
      updated_at = now()
  where stale_account.provider = 'n26'
    and stale_account.active = false
    and stale_account.metadata->>'qualityStatus' = 'corrected_superseded'
    and stale_account.metadata ? 'supersededByAccountId'
    and v_deleted_count > 0;
end
$$;
