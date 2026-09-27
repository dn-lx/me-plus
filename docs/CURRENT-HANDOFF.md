# Current Handoff

**Last updated:** 2026-09-27

This file is the compact implementation resume point. Canonical product/system behavior lives in the Me+ Google Drive specifications; Supabase is the source of truth for live user/integration state. Git history preserves older implementation detail.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "source-sync-framework",
  "repository": "dn-lx/me-plus",
  "branch": "dev",
  "status": "n26_live_sync_automation_on_dev_pending_release_validation",
  "last_verified_code_sha": "bad09d3c9a80cb3afadb18cd82eeb5b1c86cf3b2",
  "next_step": "Validate the non-blocking N26 callback on the dev deployment. When ready, promote dev through the approved dev-to-prod release flow; Netlify Scheduled Functions run only on published production deploys. After the first production scheduled run, verify source_sync_runs and data_sources.last_sync_at update without user interaction.",
  "updated_at": "2026-09-27T18:25:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Current N26 runtime state

- N26 is connected through Enable Banking in read-only AISP mode.
- Supabase currently reports the N26 data source as active.
- The latest verified successful N26 sync completed on 2026-09-27 and imported normalized account/transaction data.
- The stored provider consent/session is reusable; ordinary refreshes do not require the user to authorize N26 again. Reauthorization is needed only when consent/session validity or provider policy requires it.
- The first live OAuth callback completed its server-side sync but the browser received a Netlify 504 because the callback waited for the full import. The imported data was not lost.

## Current dev implementation

### OAuth callback
- `/api/finance/n26/callback` verifies signed state and exchanges the authorization code for an Enable Banking session.
- The callback now schedules the initial sync with Next.js `after()` and redirects the browser immediately with `n26=connected&sync=started`.
- The connection page explains that the first read-only sync continues in the background.

### Recurring refresh
- A lightweight Netlify Scheduled Function is configured for one refresh per day at `05:00 UTC`.
- The scheduled function invokes a protected Netlify Background Function for the long-running bank sync.
- The scheduler-to-worker call uses a server-only `N26_SYNC_SCHEDULER_SECRET`.
- Recoverable failures remain eligible for later daily retries; a successful sync restores normal source state.
- On-demand authenticated sync remains available through `POST /api/finance/n26/sync`.

### Source-health behavior
- Supabase `data_sources` is the current source-state record.
- `source_sync_runs` preserves each sync attempt and its outcome.
- Healthy connections should stay quiet.
- User attention is required only for conditions such as lost/expired authorization, persistent sync failure, or data becoming stale beyond the source-specific freshness policy.

## General source-sync architecture

N26 is the first working example of a reusable Me+ integration pattern:

1. Connect/authorize a source.
2. Store current connection/sync state in Supabase.
3. Refresh automatically using the source-specific cadence or event model.
4. Preserve raw/normalized provenance and historical sync attempts.
5. Retry recoverable failures automatically where safe.
6. Detect staleness using a source-specific freshness threshold.
7. Notify the user only when action is actually required.

Do not impose one refresh interval on every provider. Calendar/tasks, health/wearables, banking and future sources should each define their own cadence, retry, reauthorization and notification rules while reusing the same lifecycle.

## Validation still required

1. Verify the new dev callback returns promptly after N26 authorization and does not reproduce the 504.
2. Confirm the background initial sync completes and `source_sync_runs` records the outcome.
3. Before production release, obtain a trustworthy build/typecheck signal; previous GitHub Actions runs have sometimes failed before runner steps and should not be treated as application-test evidence by themselves.
4. Promote through the approved `dev → prod` release flow only.
5. After production promotion, verify the daily scheduled trigger invokes the background worker and updates `last_sync_at` without user interaction.
6. Confirm connection-health notification remains silent while the source is healthy and alerts only when attention is required.

## Release boundary

`dev` is the integration branch. Production changes are promoted only through the approved `dev → prod` release workflow. Do not push directly to `prod` or perform ad-hoc production deployment.

## Security reminders

- Never put bank credentials, private keys, Supabase secret keys or provider tokens in Git, client-side code, logs, chat or ordinary application tables.
- N26 authentication happens in the provider flow; Me+ stores only the provider/session identifiers required for authorized read-only access.
- Sensitive integration operations remain server-side.
