# N26 Open Banking setup

Me+ connects to N26 through Enable Banking in **read-only Account Information (AISP) mode**.

## Security boundary

- Me+ never stores the N26 username, password, PIN, TAN or card credentials.
- N26 authentication and consent happen in the bank/Open Banking authorization flow.
- The Enable Banking application private key is server-only.
- Me+ stores the Enable Banking session/account identifiers needed to refresh authorized data, but they are not sufficient without the server-side application key.
- This integration reads accounts, balances and transactions only. It does not initiate payments.

## Provider setup

1. Sign in to the Enable Banking Control Panel.
2. Create a **Production** application.
3. For personal/non-commercial testing, activate restricted production by linking/whitelisting the N26 account in the Control Panel.
4. Configure the callback URL to:
   - local: `http://localhost:3000/api/finance/n26/callback`
   - deployed: `https://<me-plus-host>/api/finance/n26/callback`
5. Put the application values in the server secret store:
   - `ENABLE_BANKING_APPLICATION_ID`
   - `ENABLE_BANKING_PRIVATE_KEY`
   - `ENABLE_BANKING_REDIRECT_URL`
   - `ENABLE_BANKING_STATE_SECRET`

Never commit the private key.

## Me+ flow

1. An authenticated client calls `POST /api/finance/n26/connect` with the current Supabase access token as a Bearer token.
2. Me+ creates a signed, short-lived callback state and starts N26 authorization through Enable Banking.
3. The client redirects the user to the returned `authorizationUrl`.
4. N26/Enable Banking redirects to `/api/finance/n26/callback`.
5. Me+ verifies the signed state and exchanges the code for an authorized Enable Banking session.
6. The callback schedules the initial read-only sync with Next.js `after()` and redirects the browser immediately with `n26=connected&sync=started`. The long-running transaction import must not block the OAuth callback response.
7. The background sync writes account, balance, transaction, consent and provenance state into Supabase. Failures are logged server-side and sync-run state remains the operational source of truth.
8. Later manual syncs call `POST /api/finance/n26/sync`.

Netlify supports Next.js asynchronous work with `next/after`. The work remains subject to the hosting function execution limit, so if initial history grows beyond that boundary the ingestion should move to a dedicated Netlify Background Function or other durable async worker.

## Stored data

Provider data is mapped into the existing Me+ finance/source model:

- `data_sources`: N26 connection metadata and last sync time
- `consents`: explicit finance read-only consent
- `source_sync_runs`: each sync attempt
- `raw_events`: provider transaction payload/provenance
- `financial_accounts`: normalized account and balance state
- `financial_transactions`: normalized transactions

The first sync requests the most recent 90 days and is idempotent by provider account/transaction IDs.

## Current validation boundary

A live N26 connection requires:
- Enable Banking application credentials in the server secret store
- explicit user authorization at N26
- runtime/typecheck/build verification
- deployed callback verification that the browser returns immediately while the initial sync completes independently

Do not treat a new callback implementation as validated until those steps pass.
