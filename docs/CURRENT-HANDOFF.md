# Current Handoff

**Last updated:** 2026-09-27

This file is the compact recovery record for unfinished work. GitHub/source/tests remain authoritative when they disagree with this handoff.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "n26-open-banking",
  "repository": "dn-lx/me-plus",
  "base": "feature/runtime-scaffold",
  "branch": "feature/n26-open-banking",
  "pr": 5,
  "status": "active_unverified",
  "last_verified_sha": "8d1c4f5bdeece401250ab936442cd319ae9eb148",
  "next_step": "Link Netlify project me-plus-personal-intelligence to GitHub repo dn-lx/me-plus using branch feature/n26-open-banking, deploy the site, verify /privacy, /terms and the callback route, then register the Enable Banking production app and configure its server-only credentials.",
  "updated_at": "2026-09-27T07:30:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Current state

The runtime scaffold remains open as draft PR #4 (`feature/runtime-scaffold` → `dev`). GitHub Actions jobs on that work have been failing before a runner/steps are assigned, so CI has not validated the workspace.

The focused N26 integration is being built on `feature/n26-open-banking`, based on the runtime scaffold rather than `prod` or `dev`.

Implemented on the N26 branch:
- Enable Banking server client with RS256 application JWT authentication
- signed short-lived callback state
- authenticated N26 connection-start endpoint
- authorization callback that exchanges the code for a provider session
- read-only normalization of N26 accounts, balances and recent transactions into the existing finance tables
- source/consent/sync/raw provenance recording
- authenticated resync endpoint
- server-only configuration placeholders
- setup/security documentation

No live N26 authorization has been performed yet. No N26 credentials, PIN, TAN or provider private key are stored in the repository. The integration remains read-only.

## Supabase status

The live Me+ schema was inspected before implementation. Existing tables already support this first N26 slice:
- `data_sources`
- `consents`
- `source_sync_runs`
- `raw_events`
- `financial_accounts`
- `financial_transactions`
- `financial_snapshots`
- `recurring_financial_commitments`

No live Supabase DDL/schema changes were made for the N26 integration.

## Validation boundary

Do not claim the N26 connection is complete until all of the following are verified:
1. Enable Banking application created and restricted production activated for the owner's N26 account.
2. Server secrets configured outside the repository.
3. Workspace install/typecheck/web build pass.
4. Explicit N26 consent completes through the redirect flow.
5. Initial account/balance/transaction sync is checked against N26.
6. RLS/user ownership is verified for the resulting finance rows.

## Recovery rule

Resume `feature/n26-open-banking`. Do not recreate the integration or mutate the live finance schema unless source inspection proves it is required. Keep the integration read-only until a separate, explicit payment-initiation decision is made.

## Production path

The dependency chain is currently:

`feature/n26-open-banking` → `feature/runtime-scaffold` → `dev` → `prod`

Production promotion remains explicit human approval only.


## Netlify callback

A Netlify project was created for Me+ on 2026-09-27. The requested name `me-plus` was unavailable, so Netlify assigned `me-plus-personal-intelligence`.

Use this permanent callback URL for Enable Banking:

`https://me-plus-personal-intelligence.netlify.app/api/finance/n26/callback`

The Netlify project exists but the Me+ runtime has not yet been deployed/validated there. Do not treat the callback as live until deployment and server-secret configuration are complete.

The Netlify project was renamed to `me-plus-personal-intelligence` for a stable, descriptive project/site name.


## Deployment preparation — 2026-09-27

Implemented and committed on `feature/n26-open-banking`:
- public `/privacy` page for the current read-only banking integration
- public `/terms` page for the current personal-use scope
- homepage links to Privacy and Terms
- root `netlify.toml` for the pnpm/Next.js web build

Netlify project `me-plus-personal-intelligence`:
- public visitor access is enabled so Open Banking redirects and legal pages are not blocked by Netlify team SSO
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ENABLE_BANKING_REDIRECT_URL`, and `ME_PLUS_ALLOW_FIXTURE_INGEST=false` are configured
- GitHub repository is not yet linked; deployment is waiting for that explicit user action
- `SUPABASE_SECRET_KEY`, `ENABLE_BANKING_APPLICATION_ID`, `ENABLE_BANKING_PRIVATE_KEY`, and `ENABLE_BANKING_STATE_SECRET` are still intentionally unset

Permanent URLs after deployment:
- `https://me-plus-personal-intelligence.netlify.app/privacy`
- `https://me-plus-personal-intelligence.netlify.app/terms`
- `https://me-plus-personal-intelligence.netlify.app/api/finance/n26/callback`
