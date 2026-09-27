# Current Handoff

**Last updated:** 2026-09-27

This is the compact resume point. GitHub source, checks, Netlify deploys, and Supabase runtime evidence take precedence over stale notes.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "n26-dev-browser-test",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "fix/n26-callback-stable-origin",
  "pr": 15,
  "status": "draft_pr_unvalidated",
  "last_verified_dev_sha": "82fc170ad2d7bf1f8b2cbaa94e0a6151ed47f860",
  "next_step": "Review PR #15 and obtain a real build/typecheck/security signal. GitHub Actions jobs have failed before any runner steps, so CI red is not a code result. Once validated, merge to dev and wait for its Git-based Netlify branch deployment. Verify /finance/connect and callback Location on the stable dev alias, then the owner signs in with the existing Me+ account and completes N26 consent. Check sync and user ownership in Supabase. Do not deploy or merge prod for this dev test.",
  "updated_at": "2026-09-27T11:00:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Observed dev deployment

- Site: `me-plus-personal-intelligence`, Netlify site ID `74bc65d4-edd9-47bc-82e5-fa82759ed7e2`.
- Stable dev alias: `https://dev--me-plus-personal-intelligence.netlify.app`.
- Last verified ready dev deploy: `6ab8ec3f4e08cca2a478eab6`, commit `82fc170ad2d7bf1f8b2cbaa94e0a6151ed47f860`. This predates PR #15.
- On that deploy, `/`, `/privacy`, `/terms` returned 200. Anonymous POST to `/api/finance/n26/connect` and `/api/finance/n26/sync` returned 401. Callback with missing code/state returned 307, but its Location was an immutable deploy permalink. PR #15 changes the redirect origin to the configured branch alias and adds a browser sign-in/connection entrypoint.
- PR #15 is draft. It uses Supabase password sign-in for the existing email account, passes the access token to the protected connection endpoint, and sends the browser to the Enable Banking authorization URL. No email template, Auth redirect allowlist, or database schema change is required for this path. The page and callback are not deployed or tested yet.
- GitHub Actions jobs for this repository have failed before runner steps (null steps/logs). Do not interpret the red checks as a TypeScript or application test result. Obtain a real build signal and inspect the final diff before merging. No PR deploy preview was available at last check.

## External configuration and data boundary

- Enable Banking application is active in restricted production for N26. Its application ID, private key, and the Supabase secret key/state secret are configured in Netlify branch-deploy context. Never copy their values to Git or browser code.
- Netlify `ENABLE_BANKING_REDIRECT_URL` for branch deploy points to `https://dev--me-plus-personal-intelligence.netlify.app/api/finance/n26/callback`. Production retains `https://me-plus-personal-intelligence.netlify.app/api/finance/n26/callback`. Confirm both URLs are individually allowed in Enable Banking; saved registration has not been independently inspected.
- Both Netlify contexts currently use Supabase project `wbqnctrvxohxwiaignhg`. A real dev bank consent/sync writes live finance data. No live N26 authorization or sync has been performed in this task.
- Supabase already has the finance tables required for this slice; no schema migration was applied here. One existing email identity has password sign-in available. The owner must enter credentials in the app themselves.
- Production Netlify still reports old deploy `6ab8d3e80c341219b5881e92`, without current server functions. No production deployment or promotion is part of this dev test.

## Verification after deployment

1. Check `/finance/connect` loads from the stable dev alias and sign-in succeeds with the existing account.
2. Check an invalid N26 callback redirects to `https://dev--me-plus-personal-intelligence.netlify.app/finance/connect?n26=error&reason=invalid_callback`, without an immutable deploy host.
3. Owner selects **Continue to N26**, completes provider consent in their browser, and returns to dev. Do not collect bank credentials or the Me+ password in chat.
4. Confirm the read-only sync result and inspect `data_sources`, `consents`, `source_sync_runs`, `financial_accounts`, `financial_transactions`, and RLS/user ownership. Compare balances/transactions with N26 in the owner's session before claiming completion.

## Release boundary

`dev` is the integration branch. Production promotion is only through the approved `dev → prod` release workflow. No direct `prod` push or ad-hoc production deploy.
