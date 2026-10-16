# Current Handoff

**Last updated:** 2026-10-16

Canonical specifications are in Me+ Google Drive, operational state in Supabase, and implementation/test/release evidence in GitHub. Source and current checks override historical summaries.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": null,
  "repository": null,
  "base": "dev",
  "branch": null,
  "pr": null,
  "status": "idle",
  "last_verified_sha": null,
  "next_step": null,
  "updated_at": "2026-10-16T08:36:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Me+ 2.0 development checkpoint

- PR #69 SEC-008 merged as `b724ad1`; all seven CI checks passed and temporary branch deletion was verified. Its source matches live migration `20261014151223`; read-only inspection confirms client denial/server access already live.
- PR #76 ME2-NATIVE-001 recovers exact applied native create/reschedule/deduplication versions and adds an additive repair for stale no-op retries and event-source replay collisions. No-op requests now retain receipts; retries preserve newer dates. The repair is **not deployed**.
- PR #76 code head `31f10f4` passed all seven CI checks, including isolated PostgreSQL, typecheck, web build and mobile web bundle. Independent review found no blocking issue. Local suite: 95 passed, 7 skipped, 0 failed. Final documentation/whitespace head must pass its checks before merge.
- Isolated tests reproduce the old no-op failure and pass the repaired contracts twice: owner scope, denied clients, retry, invalid inputs, protected tasks, event-write rollback, source collisions and cross-action request reuse. Minimal fixtures do not prove hosted Auth/JWT transport, full live triggers or concurrency; receipts require retaining event history.
- Current dev already includes PRs #70–#74: Today, Now, Daily Review and atomic completion. Native create/reschedule RPCs are deployed but app controls and authenticated two-user E2E remain unfinished. Routine scheduling and scoped read/write MCP remain follow-up work.
- PR #75 optional Langfuse tracing remains deferred: it also changes routing/models/token budgets without deployed-source provenance or behavioral regression evidence.
- Next: add native task app controls using the recovered contract; verify full signed-in E2E in an isolated test environment. Prepare the new replay repair through the reviewed release process; never blindly replay recovered migrations or assume all older repository migration versions match live history.
- No shared Supabase data/schema or production deployment changed in this continuation. Version impact: patch, recorded under Unreleased.
- Evidence/rollout detail: `docs/plans/ME2-NATIVE-001-contract-recovery.md`; historical ENG-007/Android evidence is archived below.

## Environment and release boundaries

- Supabase `wbqnctrvxohxwiaignhg` is shared by dev and production; branches do not isolate data.
- Only dev may target prod; a specific reviewed production release needs explicit user approval.
- Use native service connectors. Desktop Commander is Android build/runtime only.
- Android builds use the designated Windows Actions runner; Netlify distributes verified APKs but never compiles Android.
- Health Connect needs a real phone upload and retry before claiming device sync fixed.
- Historical ENG-007 and Android evidence: [handoff archive](handoffs/2026-10-07.md). Consult current source, PRs and runtime before relying on it.
