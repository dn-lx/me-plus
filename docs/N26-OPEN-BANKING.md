# N26 Open Banking

N26 is the first implemented bank adapter for Me+, using Enable Banking in **read-only Account Information (AISP) mode**. Current connection and deployment acceptance must be verified separately; earlier V1 operation is not proof of an active post-reset bank session.

**17 October 2026 planning update:** both N26 and ING are required. The shared [N26 + ING implementation plan](plans/ME2-BANK-012-n26-ing.md) owns the proposed connection model, provider selection, correctness, migration and acceptance sequence. This file documents existing N26-specific routes/configuration and their limitations. No integration is activated by this update.

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
6. The existing callback schedules the initial read-only sync with Next.js `after()` and redirects with `n26=connected&sync=started`. That response means work was scheduled in this implementation; it is not proof that a durable sync completed.
7. The initial sync writes source, consent, account, balance, transaction and provenance state to Supabase.

The callback must return promptly. The planned replacement persists session/consent binding and a durable job receipt before redirecting, then reports pending/complete honestly. See ME2-JOBS-011 and the banking plan; `after()` alone does not establish restart-safe progress.

## Automatic refresh

N26 has a **daily refresh intent**. Current source places the clock under Supabase and the long-running protected worker on Netlify; the old Netlify `05:00 UTC` scheduled-function description is historical. Prepared PR #77 installs the external clock inactive and records the guarded N26 worker as deployment-pending. This planning audit did not change or activate that state.

The background worker resolves an authorized session and applies idempotent ingestion. On-demand `POST /api/finance/n26/sync` also exists and must obey the same owner, runtime-readiness, source-cutoff and pause/revoke policy as recurring work. Before activation, verify the hosted worker contract and one successful source sync. ING will need independent connection controls even when it uses the same provider.

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
- The earlier adapter has a 90-day fallback; PR #77 prepares a source-specific fresh-start guard. Post-reset rollout must preserve the configured cutoff through every entrypoint and must not silently restore historical data. Reauthorization/account identity remains idempotent; multi-bank generalization is planned.

## Validation boundary

Before production release of changes to this integration:

1. Obtain a trustworthy build/typecheck result.
2. Verify the deployed callback returns promptly after authorization.
3. Verify the initial background sync completes and records `source_sync_runs`.
4. Verify the first production daily scheduled run starts the Background Function and advances `data_sources.last_sync_at`.
5. Confirm failures are observable without exposing secrets and that healthy operation produces no unnecessary user notification.

Provider APIs, consent lifetimes, rate limits and hosting/runtime behavior can change. Revalidate those implementation details when the integration changes.
