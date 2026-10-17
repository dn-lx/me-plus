# ME2-HEALTH-017 — Reliable phone health sync

## Outcome and evidence
Fix the authenticated upload 500 and schedule phone Health Connect sync every 180 minutes. Document Antigravity CLI as Me+ app implementation platform. Development branch only; no production deployment.

Verified 2026-10-17: dev 2f46e004 uses 50-reading batches; Netlify requests at 14:38:05–14:38:11 UTC fail with P0001 after one completed atomic batch. Live private.guard_source_sync_run_insert assigns the same minute run key to successive batches. PR #38 contains an unapplied narrow run-key trigger repair and foreground Changes API collector, but is stale and has no background worker. Current dev has neither collector nor scheduler. The database is shared with production; applying the repair requires explicit authorization for that shared boundary.

## Delivery
1. Recover the scoped batch-run-key migration from PR #38, retain source leases and raw revision idempotency, and reproduce same-minute failure/pass in isolated PostgreSQL with the live guard.
2. Reuse and harden the incremental collector: per-account/permission cursors, acknowledgement-before-checkpoint, bounded runtime, session/account race checks, no credentials or health values in status.
3. Add Expo BackgroundTask/TaskManager Android WorkManager registration at 180 minutes, explicit Health Connect background read permission, sign-out cancellation and resume catch-up. Android may defer runs for power/network/Doze/force-stop; do not promise exact clock execution.
4. Add explicit background sync controls/status and last-success evidence. Update durable platform docs and changelog. Keep existing verified APK metadata honest; native changes require a newly built versioned APK.
5. Run behavioral and negative tests, hosted workspace/type/build gates and independent security review. Build/verify Android on designated Windows host, preserving signer/version/provenance. Physical-phone and three-hour acceptance remain pending until measured.

## Boundaries / rollback
No provider activation, production web deploy, private payload logging or test writes to shared data. Database repair is additive and only affects atomic health batch run keys. Existing app remains compatible; deploy approved DB repair before relying on multi-batch upload. Drop the new trigger to roll back; retain historical records. Worker unregisters on disable/sign-out. Revert development source to roll back client changes.

## State
Investigation confirmed. Implementation and isolated/hosted verification in progress. Shared DB application and physical phone confirmation are pending.

## Verification checkpoint
- 2026-10-17: isolated PGlite/PostgreSQL reproduced source_sync_already_completed before repair; repaired same-minute batches, idempotent replay, source leases, ordinary duplicate protection, atomic rollback, manual correction/freshness and denied-client tests passed, including applying the trigger repair twice. Dedicated hosted PostgreSQL 17.6 workflow added.
- 19 targeted health tests passed; all workspace typechecks, Next.js build and Expo mobile web export passed. Broad local suite: 122 pass, 7 skip; 6 failures caused by intentionally incomplete local mirror (omitted skill catalog and verified APK bytes). Hosted full-repository checks remain authoritative.
- Independent security reviewer found and verified fixes for seed-before-snapshot gap, retry-after-cancellation and manual scan/account cache mismatch. No remaining security blocker by source review. Schedule/stop operations are serialized.
- Browser runtime could not launch: Chromium absent; attempted download returned a truncated archive. No visual or native permission/worker success is claimed. Physical phone tests, reboot/force-stop, granted/denied background permission, offline/retry and observed three-hour execution remain required.
- Native source target 0.4.1 / versionCode 7 / me-plus-0.4.1.apk. Existing 0.3.1 download/provenance untouched. PR #79 must reconcile code7 before any subsequent APK release.
- Antigravity CLI 1.4.0 was invoked for scoped read-only Android analysis. First headless attempt was denied command permission; read-only retry failed with provider RESOURCE_EXHAUSTED (individual quota). Coordinator performed this candidate implementation; no successful Antigravity build is claimed.
- Shared Supabase database remains unchanged. Approval requested only after a concrete reviewed migration and checks exist. Application web/native production remains unchanged.
