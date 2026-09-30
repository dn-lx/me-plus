# Current Handoff

**Last updated:** 2026-09-30

Canonical specifications are in Me+ Google Drive, operational state/checkpoints in Supabase, and implementation/test/release evidence in GitHub. Read source before trusting historical handoffs.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "health-connect-auto-sync-0.3.2",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "feat/health-connect-auto-sync-0.3.2",
  "pr": 38,
  "status": "testing",
  "last_verified_sha": "fe8e5624521bbcc239a4bfab73981b8f9395d168",
  "next_step": "Review and apply the health batch run-key migration to the shared database; run the rollback-only SQL acceptance, verify PR 38 CI and the Android installer, then validate a real phone upload.",
  "updated_at": "2026-09-30T07:42:24Z"
}
<!-- AGENT_TASK_STATE_END -->

## Health Connect correction and Android 0.3.1

PR 38 now uses one foreground incremental collector. It checks on resume/sign-in and every minute while active, scopes cursors by user and granted record types, and routes manual Sync now through the same small-batch path. The first run or an expired cursor performs a one-time seven-day backfill. No background scheduler is present; Health Connect does not push changes to reader apps. Local tests/typecheck/web build passed on the working tree; GitHub checks, a verified 0.3.2 APK, and physical-device sync are still pending.

The live source-sync guard introduced by PR 39 treats a missing run key as one logical run per minute. Multiple ≤50-reading health batches from the same origin therefore conflict after the first completes. PR 38 adds `20260930073538_health_batch_unique_run_key.sql`: a narrowly scoped before-insert trigger gives each atomic health batch a unique key while preserving source-wide serialization and revision idempotence. The SQL acceptance now exercises two same-minute bounded batches. This migration is committed for review but has **not** been applied to the shared dev/production Supabase database. Until it is applied and accepted, a multi-batch mobile upload can fail.

- PR 37 is the release candidate; its GitHub checks and build provenance determine merge readiness. PR 17 collector work is historical and superseded.
- User authorized correction, merge and web publication of the APK.
- Pipeline: Zepp → Health Connect → authenticated Me+ Android collector → backend → Supabase raw revisions and normalized observations.
- Live failures: a 500-reading lookup produced Bad Request; an earlier upload timed out.
- Mobile sends at most 50 readings per request; server caps at 100. Heart-rate raw payloads retain each sample and provider context without duplicating the full sample series.
- Provider revision IDs are SHA-256 digests. Atomic source-serialized ingestion protects freshness, retries and manual corrections.
- Supabase project: wbqnctrvxohxwiaignhg. Both dev and production APIs use this canonical database; branch names do not imply data isolation.
- Android builds must use GitHub Actions on the designated self-hosted Windows runner. Build from a committed SHA, inspect package/version and embedded JS bundle, verify signer compatibility and SHA-256, then stage the versioned APK.
- Netlify hosts web/API and distributes the verified binary; it must never compile Android. Current mobile API target is the dev branch deployment.

## Verification and release

Required before merge: behavioral health tests, atomic SQL acceptance/denied-role checks, workspace typecheck/build, repository policy/security checks, independent review, and successful self-hosted APK build with provenance.

Atomic ingestion and rollback acceptance passed: replay/freshness/manual-correction/error/last-sync/legacy-key cases and denied-role checks. All input CI passed on `0cb985a9af41acf0d42d5931f4ec913b5fd8938c`.

Windows run `36648794596` produced verified ARM64 0.3.1 (versionCode 4), with the embedded JS bundle and previous installer signer. APK SHA-256: `0b2ea0577b39bbf0a6b5f561fc49327cf50feadde827714aa71e7e60521f7c6b`; size 44,362,126 bytes. Download/provenance are in `apps/web/public/downloads/` and `releases/android/0.3.1.json`. The downloaded artifact digest and Git blob match the published bytes. Final artifact-head checks precede merge.

Build repair: pnpm 12 workspace `nodeLinker: hoisted`, short physical native paths, checksum-pinned SDK Ninja 1.13.2 (runner previously had 1.10.2), and Expo 57 compatible native pins. Expo compatibility and peer checks pass.

Required before claiming phone sync fixed: install the new APK and perform a live Health Connect upload on the phone; inspect successful canonical sync/observation state and repeat idempotently. A device upload cannot be fabricated from connector access.

Production path: focused fix → dev → approved dev-to-prod PR. Never bypass the production branch or release gate. Rollback web through the last known-good deployed revision; preserve additive history schema. Keep earlier APK versions available.

## Service boundaries

Use native GitHub, Supabase, Google Drive and Netlify connectors for service operations. Desktop Commander is Android-host troubleshooting only. Credentials and sensitive provider payloads stay out of Git and logs. The current Netlify connector cannot select a dev revision; verify the dev API/web deployment before claiming it is published.
