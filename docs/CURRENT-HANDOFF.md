# Current Handoff

**Last updated:** 2026-09-28

This file is the compact implementation resume point. Canonical product/system behavior lives in the Me+ Google Drive specifications; Supabase is the source of truth for live user/integration state. Git history preserves older implementation detail.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "BNK-003",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "fix/bnk-003-n26-account-reconciliation",
  "pr": 32,
  "status": "live_data_repaired_code_verification_blocked",
  "last_verified_sha": "c9e9d4db3f15868cf43c42af9b102ecd20f538a2",
  "next_step": "Run the full pnpm workspace check/build when a real runner/local machine is available. If green, mark PR #32 ready, merge it into dev, then use the normal approved dev-to-prod release path. After deployment, run an N26 refresh/reauthorization regression and verify the canonical account count and transaction count remain stable.",
  "updated_at": "2026-09-29T09:40:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Current Health Connect implementation

- PR #17 (`feature/health-connect-collector` → `dev`) is the active Health Connect collector slice.
- The existing Me+ mobile app is used; no separate collector repository is being created.
- `react-native-health-connect` 4.1.3 is configured with Expo SDK 57 and Android read permissions.
- The mobile app includes a live Health Connect screen that requests read access and inventories the last 7 days of supported record types.
- Inventory currently covers heart rate, resting heart rate, oxygen saturation, sleep sessions, steps, exercise sessions, active calories, total calories, and weight.
- The screen reports record count, source/data origin, latest observed timestamp, and per-type errors.
- Existing fixture sensor diagnostics remain available as a deterministic test harness.
- The user has already confirmed Zepp data is present in Health Connect and relevant permissions are enabled.
- No health records are uploaded to Supabase yet. This is intentional: the canonical sequence requires observing the real Health Connect inventory and source origins first, then designing raw/normalized mappings.

## Local-machine validation decision

The user chose local Android compilation/testing instead of setting up a cloud build pipeline at this stage. The next validation path is:

1. Check out `feature/health-connect-collector` locally.
2. Install dependencies with the repository's pnpm toolchain.
3. Generate/run the native Android development build.
4. Install on the user's Android phone over the normal local Android development path.
5. Open the Me+ Health Connect screen, grant read access, and scan the last 7 days.
6. Capture populated record types and source/data-origin values from Zepp.
7. Use that observed inventory to implement authenticated Supabase raw-event ingestion and normalized health mappings while preserving provenance.

## Verification state

- GitHub Actions runs for the Health Connect branch failed before any workflow steps executed, so they are not trustworthy application-test evidence.
- A trustworthy local typecheck/native build/runtime signal is still required.
- PR #17 must not be treated as validated or ready to merge until local/native verification succeeds.

## Canonical Health Connect architecture already documented

The Google Drive Me+ specifications already define the health ingestion architecture and implementation order:

- Amazfit Active 3 Premium / future Helio Strap → Zepp → Health Connect → Me+ Android collector → backend normalized store.
- Health Connect is an exchange layer, not the permanent database.
- Preserve provider/device/source metadata and separate raw ingestion from normalized records.
- Inventory the record types Zepp actually exposes before finalizing database mappings and upload behavior.
- Zepp-specific data that Health Connect does not expose should use official Zepp export/data-portability or approved API paths, not scraping/reverse engineering.

The local-machine testing choice is implementation state, not a canonical architecture change, so it belongs in this handoff and Supabase interaction history rather than being duplicated into the Drive specifications.

## Current N26 runtime state

The previous dev handoff for N26 remains valid historical implementation context and is preserved here so it is not lost while the active task is Health Connect.

- N26 is connected through Enable Banking in read-only AISP mode.
- Supabase reports the N26 data source as active.
- The latest verified successful N26 sync completed on 2026-09-27 and imported normalized account/transaction data.
- The stored provider consent/session is reusable; ordinary refreshes do not require the user to authorize N26 again. Reauthorization is needed only when consent/session validity or provider policy requires it.
- The first live OAuth callback completed its server-side sync but the browser received a Netlify 504 because the callback waited for the full import. The imported data was not lost.

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

## Release boundary

`dev` is the integration branch. Feature/fix/chore branches merge into `dev`; production changes are promoted only through the approved `dev → prod` release workflow. Do not push directly to `prod` or perform ad-hoc production deployment.

## Security reminders

- Never put bank credentials, private keys, Supabase secret keys, provider tokens, or sensitive health data in Git, client logs, prompts, or public application telemetry.
- Mobile Health Connect permission grants do not imply permission to persist every available record; ingest only data required by an explicit Me+ workflow.
- Preserve user ownership, RLS, provenance, and raw/normalized separation for health ingestion.
- Sensitive integration operations remain server-side.


## Backend scheduler takeover — 2026-09-28

Production Supabase now owns the authoritative Hourly clock and scheduler watchdog.

- Migration `20260928203207_meplus_backend_scheduler_runtime` created `scheduler_dispatches`, private backend scheduler/watchdog functions, scheduler policy `1.14-draft`, and pg_cron jobs at minute 00 / 15.
- Migration `20260928203500_index_scheduler_dispatch_run_fk` added the foreign-key index identified by the Supabase performance advisor.
- Live acceptance materialized six due routine actions, completed the canonical scheduler run, left zero scheduler leases, and a same-hour retry returned idempotently.
- The backend Hourly and watchdog heartbeats are healthy under policy `1.14-draft`.
- The previous ChatGPT Scheduled Hourly task and watchdog were intentionally disabled after acceptance.
- External Todoist execution is deliberately not fabricated: no server-side Todoist credential exists in Supabase Vault or the repository. Work requiring Todoist/AI execution is durably recorded in `scheduler_dispatches` with a blocked diagnostic until a backend adapter is configured.


## BNK-003 — N26 reconnect identity reconciliation — 2026-09-29

- The Engineering Issue Register identified BNK-003 as the highest-priority unresolved issue (Critical).
- Root cause confirmed: Enable Banking account UIDs are session-scoped, while Me+ normalized account identity was keyed to that reconnect-sensitive UID.
- Production migration `20260929092808_fix_n26_account_identity_reconciliation` added a nullable provider stable-identity key and uniqueness guard.
- The guarded repair removed only exact duplicate normalized transaction rows from the already-superseded N26 account. Current live result: 1 active N26 account, 60 normalized N26 transactions, 0 duplicate groups, 0 normalized rows on the superseded account.
- All 120 raw N26 transaction events and the superseded account record were retained for provenance/history.
- PR #32 adds provider `identification_hash`/historical-hash reconciliation, conservative bootstrap for the previously reconciled legacy canonical row, stable raw-event idempotency across UID rotation, and targeted regression tests.
- Targeted tests are green (7/7) and the identity helper passes strict TypeScript compilation.
- GitHub Actions for the current code SHA fail before any workflow step starts and provide no logs; the authorized local desktop is offline. Therefore the full monorepo typecheck/build remains an infrastructure-blocked verification gate, and PR #32 stays draft.
