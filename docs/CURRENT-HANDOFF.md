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
  "status": "implementing",
  "last_verified_sha": "68e0af5162b329e94c0b3c53552a002d0a0ed109",
  "next_step": "Resolve the dependency-audit blocker, review guardrails and reconcile deployed-versus-branch provenance before approved promotion. New guardrails are tested but NOT deployed. See docs/plans/ENG-007-guardrails-and-improvement-watch.md and its verification evidence.",
  "updated_at": "2026-10-07T07:06:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## ENG-007 current follow-up

- Existing PR #67 remains the sole task branch; no competing branch was created.
- `supabase/patches/eng_007_routing_guardrails.sql` corrects intent/topic precedence, whitespace and word boundaries, direct issue-key lookup, repeated candidate context, local registration validity and conservative ambiguity handling. It is a patch candidate, not an applied or timestamp-invented migration.
- Isolated PostgreSQL 17.6 CI run 37584524679 passed 54/54 behavioral and denied-role assertions twice (initial application and repeat application), on the PR merge ref for code commit `68e0af5162b329e94c0b3c53552a002d0a0ed109`.
- On that code commit, runtime/workspace, agent-stack, version, Semgrep and Gitleaks checks passed. Dependency audit failed on `shell-quote` advisory GHSA-pqg4-j6r4-53mv. Android builder was queued when inspected; no phone or Android validation is claimed. See `docs/plans/ENG-007-verification-20261007.md`.
- Prior live gateway/bootstrap changes have advanced beyond this branch's older gateway source. Do not deploy this branch wholesale or replay old migration filenames. Reconcile source and migration provenance first; then generate a new migration with the installed Supabase CLI and follow the reviewed release path.
- No live runtime, scheduler clock, permission or production-branch change was made in this follow-up. No measured end-to-end speedup is claimed. The inspected last-24-hour gateway samples did not contain the newer deployed gateway version.
- External configuration writes: enabled the user-requested Me+ Improvement Watch (daily around 09:00 Europe/Berlin, Monday digest); appended its independently versioned read-only policy to the canonical Scheduler specification; recorded policy/test/provenance references on ENG-007. The observer never repairs, deploys, mutates user data, or rewrites issues/docs. Task creation is not proof of future execution or notification receipt.
- Keep ENG-007 open until source/release reconciliation, independent review, consumer/connector acceptance and real cold/resumed-chat measurements pass. Documentation-only follow-up commits do not imply new full-head CI evidence; inspect the current head before merge.

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
