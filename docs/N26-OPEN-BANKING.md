# N26 Open Banking

N26 is the first live banking integration for Me+. It uses Enable Banking in **read-only Account Information (AISP) mode** and follows the general Me+ source-sync lifecycle.

## Security boundary

- Me+ never stores the N26 username, password, PIN, TAN or card credentials.
- N26 authentication and consent happen in the bank/Open Banking authorization flow.
- The Enable Banking application private key and scheduler secret are server-only.
- Me+ stores provider/session/account identifiers required for authorized refreshes, but those identifiers are not sufficient without server-side credentials.
- The integration reads accounts, balances and transactions only. It does not initiate payments.

## Provider configuration

Configure the Enable Banking application with the appropriate callback URL:

- local: `http://localhost:3000/api/finance/n26/callback`
- deployed: `https://<me-plus-host>/api/finance/n26/callback`

Required server secrets/configuration:

- `ENABLE_BANKING_APPLICATION_ID`
- `ENABLE_BANKING_PRIVATE_KEY`
- `ENABLE_BANKING_REDIRECT_URL`
- `ENABLE_BANKING_STATE_SECRET`
- `N26_SYNC_SCHEDULER_SECRET`

Never commit these values.

## Connection flow

1. An authenticated Me+ client calls `POST /api/finance/n26/connect`.
2. Me+ creates signed short-lived state and starts N26 authorization through Enable Banking.
3. The browser completes provider consent.
4. Enable Banking redirects to `/api/finance/n26/callback`.
5. Me+ verifies state and exchanges the authorization code for an Enable Banking session.
6. The callback schedules the initial read-only sync with Next.js `after()` and redirects the browser immediately with `n26=connected&sync=started`.
7. The initial sync writes source, consent, account, balance, transaction and provenance state to Supabase.

The callback must not wait for the full transaction import. OAuth/provider callbacks are latency-bounded; long ingestion runs independently of the browser request.

## Automatic refresh

N26 currently uses a **daily** refresh policy.

- A Netlify Scheduled Function triggers at `05:00 UTC`.
- The scheduled function starts a protected Netlify Background Function.
- The background worker resolves the stored Enable Banking session and runs the normal idempotent N26 sync.
- On-demand authenticated refresh remains available through `POST /api/finance/n26/sync`.

Netlify Scheduled Functions are lightweight triggers and run only on published production deploys. The long-running ingestion belongs in the Background Function. If the initial callback sync later exceeds the hosting limit for `after()`, the callback should enqueue the same durable/background path rather than block the browser.

## Sync and health semantics

Supabase owns current/historical integration state:

- `data_sources`: current N26 source/connection state and last successful sync time
- `consents`: finance read-only consent
- `source_sync_runs`: one historical record per sync attempt
- `raw_events`: raw transaction provenance
- `financial_accounts`: normalized account/balance state
- `financial_transactions`: normalized transactions

Important rules:

- `last_sync_at` represents the last successful refresh, not merely the last attempt.
- A failed retry does not erase known-good data.
- Recoverable failures remain eligible for later scheduled retries.
- Reauthorization is requested only when the stored consent/session can no longer be used.
- Healthy sources stay quiet; notify only when user action is required or freshness exceeds policy.
- The initial import requests the most recent 90 days and is idempotent by provider account/transaction identity.

## Validation boundary

Before production release of changes to this integration:

1. Obtain a trustworthy build/typecheck result.
2. Verify the deployed callback returns promptly after authorization.
3. Verify the initial background sync completes and records `source_sync_runs`.
4. Verify the first production daily scheduled run starts the Background Function and advances `data_sources.last_sync_at`.
5. Confirm failures are observable without exposing secrets and that healthy operation produces no unnecessary user notification.

Provider APIs, consent lifetimes, rate limits and hosting/runtime behavior can change. Revalidate those implementation details when the integration changes.
