drop policy if exists financial_transactions_insert_manual on public.financial_transactions;
drop policy if exists financial_transactions_update_manual on public.financial_transactions;

create policy financial_transactions_insert_manual
on public.financial_transactions
for insert
to authenticated
with check (
  (select auth.uid())=financial_transactions.user_id
  and financial_transactions.data_source_id is null
  and financial_transactions.external_transaction_id is null
  and exists (
    select 1
    from public.financial_accounts a
    where a.id=financial_transactions.financial_account_id
      and a.user_id=financial_transactions.user_id
      and a.data_source_id is null
      and a.provider is null
  )
);

create policy financial_transactions_update_manual
on public.financial_transactions
for update
to authenticated
using (
  (select auth.uid())=financial_transactions.user_id
  and financial_transactions.data_source_id is null
  and financial_transactions.external_transaction_id is null
  and exists (
    select 1
    from public.financial_accounts a
    where a.id=financial_transactions.financial_account_id
      and a.user_id=financial_transactions.user_id
      and a.data_source_id is null
      and a.provider is null
  )
)
with check (
  (select auth.uid())=financial_transactions.user_id
  and financial_transactions.data_source_id is null
  and financial_transactions.external_transaction_id is null
  and exists (
    select 1
    from public.financial_accounts a
    where a.id=financial_transactions.financial_account_id
      and a.user_id=financial_transactions.user_id
      and a.data_source_id is null
      and a.provider is null
  )
);
