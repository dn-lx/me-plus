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
  "updated_at": "2026-10-16T12:20:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Me+ 2.0 backend/integration checkpoint

- User explicitly authorized live DB/integration completion on 16 October and waived Supabase PRs; app/website work remains deferred. Source snapshot is `feature/me2-backend-integrations`, based on dev `cf90a19`. No prod merge or app/web publication.
- PRs #69 and #76 are merged. The native replay repair is now applied as live version `20261016084240` (existing source filename `20261016083256`); do not reapply it or the recovered historical migrations.
- Fixed live signup/profile bootstrap; deployed native routine definition/audit/scheduling, recommendation feedback, scoped client token lifecycle/audit/rate limits and bounded workspace read. All three acceptance suites passed isolated PostgreSQL and live-schema rollback testing; no synthetic data persists.
- Deployed me-plus-mcp v1, Health Sync Drive v27 and Calendar v18. MCP is scoped opaque bearer auth, not OAuth and not yet connected to an actual ChatGPT/Letta/n8n client. Calendar now uses its own wake-secret auth instead of an incompatible platform JWT gate. Hosted denied-path checks passed.
- Native deterministic half-hour routine clock is active, locally sleep-gated and makes no AI/Todoist calls. Calendar, Health Sync and N26 clocks are installed inactive. Three source configurations are pending_authorization with fresh-start cutoffs; no deleted V1 history was imported. One profile, zero actions/routines/recommendations/tokens/sync runs verified.
- Both Google authorization probes fail with authorization_required: renew their existing Google credentials through secure Supabase Edge Function Secrets, then verify a fresh-only sync before activating clocks. No secret values were read or emitted.
- N26 worker diagnostic returns 200 and confirms config presence, but there is no bank consent/session. The N26 history guard is source-prepared and tested, **not deployed**; roll it out to the backend before fresh bank consent. Health Connect needs a real device upload at app stage.
- Langfuse/Letta/n8n remain optional, intentionally unprovisioned/unconnected pending account, privacy, recovery and measured-benefit gates. PR #75 still mixes exporter/routing changes and remains deferred. Existing reasoning worker v41 and gateway v26 unchanged.
- Checks: Node 111 passed / 7 pre-existing skipped / 0 failed; focused strict TypeScript passed; isolated and live rollback DB suites passed; independent security review clear. New hosted PostgreSQL/Node workflow runs on the source branch; inspect actual SHA/run before claiming its CI outcome. Full app/browser OAuth/device E2E was not run.
- Exact live migration provenance, endpoint/RPC contracts, activation/rollback procedures and remaining manual steps: `docs/plans/ME2-BACKEND-002-integrations.md`.

## Authorization-deferred continuation

- User will authorize providers later and explicitly asked to finish all other setup. Continued the same source branch; no PR requested, no app/site/prod release.
- Applied integration control migration `20261016121130`; owner status/probe/pause/start/clock APIs are live. Fresh server-only nonce proof is required before start; successful own-source sync after private activation is required before recurring clock enable. Stable receipts prevent old start retries undoing pause. Existing single-account workers refuse multi-owner activation.
- Google workers now Health Sync v28 / Calendar v19. Both real owner-bound callbacks recorded authorization_required; no sign-in or data import occurred. All three external clocks remain off and sources pending. Only two failed-authorization proof records were committed; no synthetic activation/user/sync records remain.
- N26 functions are built and verified as API2 Node24 ZIPs with history guard, protected diagnostic contract marker and explicit background mode. Deployment remains pending: current Netlify tools offer no deploy action and no CLI authentication is configured. No assumption of Git CD, credential copying, or production unlock was made. CI builds/preserves the functions-only artifact.
- New control SQL passed isolated and live rollback acceptance; Node 112 passed / 7 pre-existing skipped / 0 failed; focused strict TypeScript passed; extracted ZIP payloads deny missing/invalid secrets with no network access. Independent reviews clear. Prior hosted CI at a469982 passed; inspect the new final SHA's readiness workflow/artifact before claiming its result.
- Reproducible artifact build, exact API contracts, activation/pause sequence, multi-owner/in-flight limitations and remaining deployment capability: `docs/plans/ME2-INTEGRATIONS-004-control-and-rollout.md`.

## Environment and release boundaries

- Supabase `wbqnctrvxohxwiaignhg` is shared by dev and production; branches do not isolate data.
- Only dev may target prod; a specific reviewed production release needs explicit user approval.
- Use native service connectors. Desktop Commander is Android build/runtime only.
- Android builds use the designated Windows Actions runner; Netlify distributes verified APKs but never compiles Android.
- Health Connect needs a real phone upload and retry before claiming device sync fixed.
- Historical ENG-007 and Android evidence: [handoff archive](handoffs/2026-10-07.md). Consult current source, PRs and runtime before relying on it.
