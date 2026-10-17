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
