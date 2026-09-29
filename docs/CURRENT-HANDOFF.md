# Current Handoff

**Last updated:** 2026-09-30

Canonical specifications are in Me+ Google Drive, operational state/checkpoints in Supabase, and implementation/test/release evidence in GitHub. Read source before trusting historical handoffs.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "health-connect-upload-0.3.1",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "fix/health-connect-upload-0.3.1",
  "pr": 37,
  "status": "implementing",
  "last_verified_sha": "1a14b601dbf174b12fc3a6a1a67345b15e3c5356",
  "next_step": "Verify atomic ingestion, pass CI, verify self-hosted standalone APK, merge PR 37, then publish through release workflow.",
  "updated_at": "2026-09-29T23:05:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Health Connect correction and Android 0.3.1

- PR 37 is the current task; PR 17 collector work is historical and superseded.
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

Required before claiming phone sync fixed: install the new APK and perform a live Health Connect upload on the phone; inspect successful canonical sync/observation state and repeat idempotently. A device upload cannot be fabricated from connector access.

Production path: focused fix → dev → approved dev-to-prod PR. Never bypass the production branch or release gate. Rollback web through the last known-good deployed revision; preserve additive history schema. Keep earlier APK versions available.

## Service boundaries

Use native GitHub, Supabase, Google Drive and Netlify connectors for service operations. Desktop Commander is Android-host troubleshooting only. Credentials and sensitive provider payloads stay out of Git and logs.
