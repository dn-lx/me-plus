# Current Handoff

**Last updated:** 2026-10-16

Canonical specifications are in Me+ Google Drive, operational state in Supabase, and implementation/test/release evidence in GitHub. Source and current checks override historical summaries.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "ME2-AGENTS-006",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "feature/me2-backend-integrations",
  "pr": 77,
  "status": "blocked",
  "last_verified_sha": "b9dad87f064a410559c40c6738a7523ebe7b9683",
  "next_step": "Pre-authorization packages verified; durable host/identity, approved model and real credentials/acceptance deferred. See ME2-AGENTS-006 plan.",
  "updated_at": "2026-10-16T13:25:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Agent integration continuation

- User explicitly requests Letta/n8n preparation before authentication; N26 still deferred. Draft PR77 binds this branch. ME2-AGENTS-006 preparation done: local SDK session/task tool, inactive n8n workflow/import CLI, disabled Langfuse OTLP metadata exporter, privacy/recovery runbook and downloadable CI artifact. No persistent host, real key/token or provider activation created.
- MCP v2 scope metadata deployed; hosted missing/forged bearer401. Local Node126 passed/7 skipped; focused24 and independent review clear; actual Letta SDK/local synthetic no-inference handshake, n8n2.43.7 isolated import and dependency audit0 passed. All hosted checks green at ccb3029; verify final source SHA. Plan: `docs/plans/ME2-AGENTS-006-letta-n8n.md`. Live authorized tool execution, runtime isolation, model/budget and backup/fallback acceptance remain pending.

## Current backend checkpoint

- User authorized shared DB/integration setup and waived Supabase PRs. Provider authorization and N26 explicitly deferred; do not prompt again. App/website implementation is the next stage, not published. No production merge. Source: `feature/me2-backend-integrations`, based on dev `cf90a19`.
- Live: signup/profile fix, routines/history/feedback, native task APIs, scoped token lifecycle/MCP v1, integration status/probe/pause/start/clock controls. Health Sync v28 / Calendar v19 use own wake auth and nonce-bound server proofs; both remain authorization_required. Native routine clock active with Berlin 06–22 sleep gate; all three external clocks off. No Todoist restoration or old V1 import.
- Lifecycle migrations `20261016123952` / `20261016123953` deployed. Stale internal native occurrences expire after disablement/ending; execution history, manual/legacy/external records preserved. Owner readiness reports current database configuration ready, with app/device/provider acceptance separate. One profile, zero actions/routines; synthetic rollback records removed.
- Security review clear. Hosted PostgreSQL 17.6 run https://github.com/dn-lx/me-plus/actions/runs/38901981341 passed owner/negative/rollback contracts and concurrent completed/partial/skipped decisions versus cleanup; Node 112 passed, 7 pre-existing skipped. Live-schema rollback acceptance passed. Latest source CI must also pass.
- N26 guarded API2 Node24 ZIPs are built/verified but not deployed; rollout and consent deferred. MCP uses opaque scoped bearer tokens, not OAuth; no actual client connected. Health Connect requires physical-device upload/retry. Letta/n8n/Langfuse optional and unprovisioned behind adoption/privacy/recovery gates. PR75 model routing deferred; gateway v26/reasoning v41 unchanged.
- Detailed contracts, evidence, rollback and migration provenance: `docs/plans/ME2-BACKEND-002-integrations.md`, `docs/plans/ME2-INTEGRATIONS-004-control-and-rollout.md`, `docs/plans/ME2-SETUP-005-native-lifecycle.md`; historical checkpoint `docs/handoffs/2026-10-16-backend.md`.
- Native replay repair live version `20261016084240` matches source `20261016083256`; do not replay it or recovered historical migrations.

## Release boundaries

- Supabase `wbqnctrvxohxwiaignhg` is shared across dev/production; branches do not isolate data. Specific production releases need approval and only dev may target prod.
- Use service connectors. Desktop Commander is Android build/runtime only. Android uses the designated Windows runner; Netlify distributes verified APKs and never compiles Android.
- Next: app/website sign-in/onboarding and device/client acceptance, then provider authorization when user is ready. Do not claim E2E readiness from database configuration.
