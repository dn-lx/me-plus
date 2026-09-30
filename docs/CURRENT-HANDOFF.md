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
  "last_verified_sha": "5287c40bc1e3614d3c93a87dcc1876e32ad017bb",
  "next_step": "Verify the repaired incremental sync head in CI and the Android installer; validate a real phone upload before claiming device behavior.",
  "updated_at": "2026-09-30T07:14:23Z"
}
<!-- AGENT_TASK_STATE_END -->

## Health Connect correction and Android 0.3.1

PR 38 now uses one foreground incremental collector. It checks on resume/sign-in and every minute while active, scopes cursors by user and granted record types, and routes manual Sync now through the same small-batch path. The first run or an expired cursor performs a one-time seven-day backfill. No background scheduler is present; Health Connect does not push changes to reader apps. Local tests/typecheck/web build passed on the working tree; GitHub checks, a verified 0.3.2 APK, and physical-device sync are still pending.

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
