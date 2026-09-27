# Current Handoff

**Last updated:** 2026-09-27

This is the compact resume point. GitHub source, checks, Netlify deploys, and Supabase runtime evidence take precedence over stale notes.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "n26-dev-browser-test",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "dev",
  "pr": 16,
  "status": "auth_start_fix_merged_waiting_retry",
  "last_verified_dev_sha": "16915bd59cdb1d35ad331b07b313865fcc895e86",
  "next_step": "Wait for the Netlify dev branch deploy of PR #16, then retry Continue to N26. Supabase logs already proved password sign-in and server-side auth.getUser succeed; the remaining failure was after user validation. PR #16 adds robust Enable Banking private-key parsing and safe provider error diagnostics. If the provider still rejects the request, use the displayed HTTP/error code to correct application/redirect/activation configuration.",
  "updated_at": "2026-09-27T17:45:00Z"
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


## PR #15 merge — 2026-09-27

PR #15 (`fix/n26-callback-stable-origin` → `dev`) was reviewed and merged at `1a27016bc4a1677e3e9cfb4bb76a8afd01f43b63`.

Before merge:
- the callback redirect was reviewed to use the configured Enable Banking redirect origin, so Netlify branch deploys return to the stable dev alias instead of an immutable deploy permalink;
- the new `/finance/connect` page uses Supabase password sign-in for the existing Me+ account and sends the bearer access token only to the protected server connection endpoint;
- browser navigation accepts only an HTTPS provider authorization URL;
- Netlify branch-deploy configuration was verified to have the stable dev callback and required server-side banking/Supabase secret variables configured;
- the PR's accidental historical changelog edits were removed and the changelog heading restored;
- GitHub Actions remained unavailable before runner assignment (null steps/logs), so their red state was not treated as application-test evidence.

No production merge is part of PR #15. Validate the resulting Netlify `dev` deployment before considering release.


## N26 authorization-start failure — 2026-09-27

The owner successfully signed into Me+ on the stable dev alias, but **Continue to N26** returned the generic start failure.

Runtime evidence:
- Supabase password login returned 200 for the existing Me+ user.
- The subsequent server-side Supabase `GET /auth/v1/user` also returned 200, proving the bearer token reached the server and was accepted.
- No N26 `data_sources`, accounts, transactions, or sync runs existed afterward, so the failure occurred before provider consent/session creation.

PR #16 was merged to `dev` at `16915bd59cdb1d35ad331b07b313865fcc895e86`.
It:
- accepts Enable Banking RSA private keys as PEM, escaped PEM, base64 PKCS#8/PKCS#1 DER, or base64-encoded PEM;
- validates that the parsed key is RSA before RS256 signing;
- surfaces only safe provider HTTP/error codes to the connection page if Enable Banking rejects the request.

Current Enable Banking docs still require RS256 JWT with application ID as `kid`, issuer `enablebanking.com`, audience `api.enablebanking.com`, and POST `/auth`; the existing request shape remains aligned with that API.

Next step: retry from the newly deployed dev build. Do not change bank credentials or paste the private key into chat.
