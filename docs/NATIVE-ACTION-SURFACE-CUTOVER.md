# Me+ 2.0 — Native action surface cutover

Status: **migration decision recorded; cutover NOT YET applied** (2026-10-15).

## Product decision

Me+ Today, Now, and Review are the canonical task/routine execution UI. Supabase `actions`, `action_events`, `routines`, `routine_events`, `recommendations`, and feedback remain the source of truth. Todoist is no longer a target Me+ execution surface. Do not delete canonical actions, history, goals, or routines when decommissioning the external service.

This explicit product decision supersedes the old Todoist execution-surface portions of the Scheduler & Automation Behavior, Data Foundation, Daily Life, and Me+ 2.0 Platform Architecture specifications. Sync the canonical Drive specifications and their versioned Supabase policy mirrors in the same release process.

## Live dependency inventory (2026-10-15)

- Supabase `private.scheduler_runtime_registry` still expects `todoist_execution_dispatcher` enabled.
- Cron: `meplus-todoist-execution-dispatcher` and date-scoped `meedge-todoist-20261016` were active during audit. Edge cron planner may recreate date-scoped jobs.
- Legacy follow-up cron: `meplus-routine-surface-cutoff-cleanup` and `meplus-routine-surface-cutoff-retry`; their functions enqueue external surface cleanup.
- Trigger/wake helpers include `private.wake_todoist_on_ready_dispatch`, `private.wake_todoist_on_guidance_refresh`, `private.wake_meplus_todoist_dispatcher`, `private.wake_meplus_todoist_surface_cleanup`.
- Deployed Edge Function: `me-plus-todoist-dispatcher`; source at `supabase/functions/me-plus-todoist-dispatcher/index.ts`.
- Canonical data still contains Todoist projection, catalog, completion cursors, sync metadata and integration-state tables. Preserve history until data provenance is reconciled.
- Shared AI reasoning, calendar, state building, Gateway, retention, health and deterministic routine scheduling are **not** Todoist-specific and must remain operational.

## Cutover order and acceptance gates

1. Complete authenticated two-user staging verification of native `/today` → `record_meplus_action_decision` → `actions` status + **exactly one** `action_events` event. Verify denial for another user's action, anonymous rejection, retry/idempotency semantics, transaction rollback, and Daily Review accuracy. The static regression test is not a substitute.
2. Verify Me+ native task creation/editing/postponement, routine occurrences, daily Today and Now refresh, and notification delivery. Add missing functionality before switching off the only active execution surface.
3. Move guidance and hourly planner outputs directly into canonical actions/recommendations consumed by the app; remove all assumptions that external tasks must be projected or re-imported. Keep calendar and approved intelligence integrations.
4. Implement a versioned, reversible **native_actions_only** feature gate. Gate cron planning, event-trigger wakeups, surface dispatch claims, and routine cutoff jobs consistently; do not just disable one cron job.
5. In a reviewed Supabase migration, disable Todoist cron/backstop and date-scoped jobs, disable external wake triggers, mark the Todoist runtime as intentionally retired (so the watchdog does not resurrect it), and stop catalog/completion sync. Ensure migrations and rollback scripts are idempotent and do not delete user tasks.
6. Deploy and test on staging. Reconcile all pending external dispatches, record truthful final states, verify no Todoist API calls or error loops, and validate app behavior over a scheduler cycle.
7. Deploy approved cutover, observe health, then archive the old function and integration tables after retention and export review. Disconnect/revoke Todoist credentials separately. Never delete user-owned Todoist content as a side effect.
8. Update canonical Drive specs, routing policies, operational runbook, integration catalog and architecture diagrams, and confirm that production UI is the native Me+ app.

## Do not remove

- Supabase action engine, completion RPC, recurrence and deterministic scheduler.
- Me+ Gateway, model routing/AI reasoning worker fallback, state builder and auditing.
- Google Calendar, health, retention, finance or other unrelated ingestion workers.

## Validation evidence

The repository contains native Today decision and Daily Review screens. `tests/native-task-surface.test.mjs` adds **source-level** contract checks only. The live authenticated E2E and complete decommission are **pending**; do not announce them as complete or disable production automations until the safety gates above are satisfied.
