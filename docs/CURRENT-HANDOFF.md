# Current Handoff

**Last updated:** 2026-09-27

This file is the compact recovery record for unfinished work. GitHub/source/tests remain authoritative when they disagree with this handoff.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "netlify-dev-build",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "dev",
  "pr": 10,
  "status": "typescript_fix_merged",
  "last_verified_sha": "eef64a2bdc02dff5a1ef6431318f21fcb0b1c8b3",
  "next_step": "Rerun the Netlify dev build. Dependency installation and Next.js compilation pass; PR #10 fixed the two reported TypeScript errors. Fix any further errors on dev before promoting to prod.",
  "updated_at": "2026-09-27T09:01:00Z"
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


## Netlify repository link correction — 2026-09-27

Netlify is now connected to GitHub repository `dn-lx/me-plus`, but the first production deploy used GitHub branch `prod` at commit `be476f54b375df963003fb391d91236546feaa70`. That branch predates the runtime scaffold and produced a ready deploy with no Next.js functions, so the primary site returns Netlify's 404 page.

Required user-side Netlify setting:
- change the Netlify production branch from `prod` to `feature/n26-open-banking`
- trigger a new deploy

Do not merge or modify the GitHub `prod` branch for this fix.


## Dev CI repair — 2026-09-27

A focused fix branch `fix/dev-ci-validation` and PR #7 were created from `dev`.

Repository-side CI corrections:
- stable `actions/checkout@v4`, `actions/setup-node@v4`, and `actions/setup-python@v5`
- corrected pnpm action to `pnpm/action-setup@v4`
- dependency audit now understands the pnpm workspace instead of requiring an npm lockfile
- runtime validation no longer tries to commit/push a generated lockfile from CI
- runtime validation uses read-only permissions and validates PRs/pushes for `dev`

Verification after these fixes still shows every GitHub Actions job failing before a runner is assigned: job steps are null/empty and no logs are produced. This persists across security, runtime, version, and agent-stack workflows. Therefore the remaining red status is an external GitHub-hosted-runner/account/repository Actions availability issue, not a demonstrated workflow-step or application-test failure.

Do not weaken or remove the validation jobs merely to make checks green. Merge the repository-side repair to `dev`, keep `prod` unchanged, and rerun when GitHub runner availability is restored.


## Netlify dependency fixes — 2026-09-27

Two dev-only fixes were merged after real Netlify build logs exposed dependency bootstrap issues:

- PR #8 moved Netlify to Node 24, retained pnpm 12.6.0, and removed redundant Corepack/manual install commands from the Netlify build command.
- PR #9 replaced invalid `workspace:catalog` dependency specifiers with pnpm's `catalog:` protocol in web/mobile/reasoning/ui package manifests.

Current `dev` SHA: `24756b4a1426c46e7d95205b67677ae0323ac7bb`.

Next validation: rerun the Netlify build from `dev`. Do not promote new fixes to `prod` until the dev build reaches the actual application compilation step and succeeds.
