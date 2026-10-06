# Current Handoff

**Last updated:** 2026-10-06

Canonical specifications are in Me+ Google Drive, operational state/checkpoints in Supabase, and implementation/test/release evidence in GitHub. Read source before trusting historical handoffs.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "ISSUE-ENG-007",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "fix/eng-007-routing-fast-path",
  "pr": 67,
  "status": "implementing",
  "last_verified_sha": "50bf9155ff8432bab32f1beec1fc4694965f3201",
  "next_step": "Run PR checks/review, update canonical Drive specs, then merge to dev and reverify live routing.",
  "updated_at": "2026-10-06T13:02:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Health Connect correction and Android 0.3.1

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


## ENG-007 routing fast path

- User authorized execution on 2026-10-06. Work is tracked in PR #67 from `fix/eng-007-routing-fast-path` into `dev`.
- Live Supabase now has a private intent-routing registry, service-only `server_gateway_resolve_intent`, and one-roundtrip `server_gateway_bootstrap_context_v2`.
- Live `me-plus-gateway` is v1.15.0 / Edge Function version 23 and preserves the previously deployed v1.14 feature set while adding `resolve_intent` and bootstrap v2.
- Known routes default to compact Personal State summary; unknown routes retain the full-state fallback.
- Measured database benchmark (meditation route): compact ~180.6 ms vs full ~4306.2 ms; payload 10,003 bytes vs 44,368 bytes.
- Live authenticated acceptance: HTTP 200, route `meditation_start`, spec `meditation_six_phase`, summary state, one DB roundtrip. Warm route checks also resolved `health_current`. Missing credential returned HTTP 401.
- New service RPCs have EXECUTE only for `service_role`; `anon` and `authenticated` are denied. The private routing table has RLS enabled and no public grants.
- Supabase advisors show no new warning/error attributable to ENG-007. Existing informational RLS-no-policy notices on private/server-only tables and pre-existing unrelated advisor findings remain.
- Remaining before closure: repository checks/independent review, canonical Drive specification update, merge PR #67 into `dev`, post-merge revalidation, then close ENG-007 and write final checkpoint.
