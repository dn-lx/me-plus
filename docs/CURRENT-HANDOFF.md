# Current Handoff

**Last updated:** 2026-10-07

Canonical specifications are in Me+ Google Drive, operational state/checkpoints in Supabase, and implementation/test/release evidence in GitHub. Read source before trusting historical handoffs.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "ISSUE-ENG-007",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "fix/eng-007-routing-fast-path",
  "pr": 67,
  "status": "verified_for_dev_merge",
  "last_verified_sha": "48d2b2cc4ab43eed27712d69333f2ecfc56e2e17",
  "next_step": "Merge PR #67 to dev after current required checks remain green. Production guardrail deployment still requires a generated migration, explicit reviewed dev-to-prod approval, shared-runtime acceptance, and representative v1.17 cold/resumed telemetry.",
  "updated_at": "2026-10-07T08:00:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## ENG-007 current follow-up

- PR #67 remains the sole task branch and targets `dev`; it is mergeable and no competing branch was created.
- The critical `shell-quote` audit blocker is resolved with a narrow workspace/lockfile override to patched `shell-quote >=1.11.0`. Current Security checks are green; the advisory was not suppressed.
- Repository source is reconciled to the actual shared runtime: `me-plus-gateway` Edge Function version 25 / internal `gateway-v1.17.0`, bootstrap contract `bootstrap-context-v3`, and exact applied ENG-007 migration versions `20261006124722`, `20261006125132`, `20261006125650`, `20261006211800`, and `20261006211903`. No applied migration was replayed.
- The staged guardrail patch now preserves the live v3 bootstrap contract while adding intent/topic precedence, whole-word and real-whitespace matching, direct engineering-issue lookup, compact candidates, registration validity/revalidation checks, bounded ambiguity/fallback, and fallback diagnostics propagated through bootstrap. Broken/stale registrations stay scoped to their registered specs instead of triggering broad discovery.
- Isolated PostgreSQL 17.6 CI run `37590204039` passed **64/64** behavioral, fallback and denied-role assertions with replacement replay and `production_access=false`. Current Security, Runtime, Version and Agent Stack workflows are green. CodeRabbit combined status is green; no formal GitHub review object is recorded.
- Current live system-wide read-only verification found DB reachable, 12/12 live routing regression green, zero invalid indexes, zero blocked backends and zero >5-minute idle transactions. Canonical scheduler health is healthy / healthy-idle / healthy-waiting / healthy-unmetered across enabled runtimes.
- The last 24-hour gateway audit sample still contains only four `gateway-v1.15.0` requests and no `response_bytes` samples. Therefore no v1.17 end-to-end p50/p95 or observed-call reduction is claimed. Earlier 81.07% payload and 42.72% DB-time reductions remain single-scope measured evidence, not user-visible end-to-end latency.
- System-wide advisors exposed separate pre-existing security follow-ups outside ENG-007: `server_gateway_record_medication_supplement_adherence` is a SECURITY DEFINER RPC executable by anon/authenticated, and `get_health_context` is SECURITY DEFINER executable by authenticated while accepting a caller-supplied user id. These must not be misclassified as ENG-007 regressions.
- The merged read-only observer is `Me+ System Health & Improvements`; the former standalone Improvement Watch is disabled. Me+ Doc Drift Watch remains separate.
- No new ENG-007 guardrail migration was applied to shared Supabase and no production branch/release was performed in this follow-up. Production remains gated by the repository's explicit dev→prod approval contract.

## Health Connect correction and Android 0.3.1 — historical context

- PR 37 is the release candidate; its GitHub checks and build provenance determine merge readiness. PR 17 collector work is historical and superseded.
- User authorized correction, merge and web publication of the APK.
- Pipeline: Zepp → Health Connect → authenticated Me+ Android collector → backend → Supabase raw revisions and normalized observations.
- Live failures: a 500-reading lookup produced Bad Request; an earlier upload timed out.
- Mobile sends at most 50 readings per request; server caps at 100. Heart-rate raw payloads retain each sample and provider context without duplicating the full sample series.
- Provider revision IDs are SHA-256 digests. Atomic source-serialized ingestion protects freshness, retries and manual corrections.
- Supabase project: wbqnctrvxohxwiaignhg. Both dev and production APIs use this canonical database; branch names do not imply data isolation.
- Android builds must use GitHub Actions on the designated self-hosted Windows runner. Build from a committed SHA, inspect package/version and embedded JS bundle, verify signer compatibility and SHA-256, then stage the versioned APK.
- Netlify hosts web/API and distributes the verified binary; it must never compile Android. Current mobile API target is the dev branch deployment.

## Verification and release — historical Health Connect evidence

Required before merge: behavioral health tests, atomic SQL acceptance/denied-role checks, workspace typecheck/build, repository policy/security checks, independent review, and successful self-hosted APK build with provenance.

Atomic ingestion and rollback acceptance passed: replay/freshness/manual-correction/error/last-sync/legacy-key cases and denied-role checks. All input CI passed on `0cb985a9af41acf0d42d5931f4ec913b5fd8938c`.

Windows run `36648794596` produced verified ARM64 0.3.1 (versionCode 4), with the embedded JS bundle and previous installer signer. APK SHA-256: `0b2ea0577b39bbf0a6b5f561fc49327cf50feadde827714aa71e7e60521f7c6b`; size 44,362,126 bytes. Download/provenance are in `apps/web/public/downloads/` and `releases/android/0.3.1.json`. The downloaded artifact digest and Git blob match the published bytes. Final artifact-head checks precede merge.

Build repair: pnpm 12 workspace `nodeLinker: hoisted`, short physical native paths, checksum-pinned SDK Ninja 1.13.2 (runner previously had 1.10.2), and Expo 57 compatible native pins. Expo compatibility and peer checks pass.

Required before claiming phone sync fixed: install the new APK and perform a live Health Connect upload on the phone; inspect successful canonical sync/observation state and repeat idempotently. A device upload cannot be fabricated from connector access.

Production path: focused fix → dev → approved dev-to-prod PR. Never bypass the production branch or release gate. Rollback web through the last known-good deployed revision; preserve additive history schema. Keep earlier APK versions available.

## Service boundaries

Use native GitHub, Supabase, Google Drive and Netlify connectors for service operations. Desktop Commander is Android-host troubleshooting only. Credentials and sensitive provider payloads stay out of Git and logs. The current Netlify connector cannot select a dev revision; verify the dev API/web deployment before claiming it is published.

## ENG-007 original routing acceptance — historical, not current-version evidence

- User authorized execution on 2026-10-06. Work is tracked in PR #67 from `fix/eng-007-routing-fast-path` into `dev`.
- Original live Supabase implementation added a private intent-routing registry, service-only `server_gateway_resolve_intent`, and one-roundtrip `server_gateway_bootstrap_context_v2`.
- Original gateway acceptance covered v1.15.0 / Edge version 23, compact summary for known routes and full-state fallback for unknown routes. Subsequent shared-runtime changes supersede those version/default claims; consult current Supabase state.
- Historical database benchmark (meditation): compact ~180.6 ms vs full ~4306.2 ms; payload 10,003 vs 44,368 bytes. This is not current end-to-end latency.
- Historical authenticated acceptance returned HTTP 200 for `meditation_start` and `health_current`; missing credentials returned 401. RPC execution was restricted to `service_role` and the private registry had RLS/no public grants.
- Historical advisor checks found no new ENG-007 warning. Re-run current security and release gates before promotion; this history does not override the dependency audit blocker above.
