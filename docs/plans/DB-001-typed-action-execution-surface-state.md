# DB-001 — Typed Action Execution-Surface State

## Requirement

- Requirement/task: Engineering issue DB-001 — stable execution-surface state is stored in `actions.constraint_flags`.
- Intended outcome: make durable execution-surface semantics typed and constrainable in Postgres, migrate live values without losing provenance, and move scheduler/Todoist correctness off JSON-key conventions.
- Non-goals: redesign routine metadata, solve DB-003 client mutation boundaries, change Todoist UX, or promote `dev` to `prod`.

## Verified current state

- Relevant paths/symbols: live `public.actions`; scheduler RPCs including `get_todoist_dispatch_actions`, `scheduler_record_todoist_surface_result`, `scheduler_apply_todoist_completion`, `scheduler_reconcile_todoist_completion`, `scheduler_mark_expired_routine_surfaces_unsurfaced`, `me_scheduler_probe`, `get_recent_actions`, and bundle/catalog helpers.
- Existing behavior: `actions.constraint_flags` currently carries durable values including Todoist task/project/parent IDs, `surface_state`, `surface_source`, `completion_source`, completion/surface/sync timestamps, and scheduler surface-control flags. Live scheduler functions read/write these JSON keys.
- Existing tests/checks: repository package scripts provide workspace typecheck/build and targeted JS tests; database behavior is primarily verified against live Supabase RPCs and schema queries. DB-001 needs dedicated regression assertions.
- External systems/boundaries: production Me+ Supabase project `wbqnctrvxohxwiaignhg`; GitHub repo `dn-lx/me-plus`; Todoist identifiers are persisted as external execution-surface provenance.
- Assumptions still needing confirmation: exact current migration inventory on `dev` and whether every catalog helper must be changed in the same migration versus retained only as compatibility metadata.

## Affected contracts

- User-visible behavior: no intended visible behavior change; existing tasks/completions must continue reconciling correctly.
- API/data/schema: add typed execution-surface persistence to `public.actions` (accepted by the canonical schema spec as an alternative to a separate surface table), backfill from JSON, add constraints/indexes, update scheduler RPCs to use typed fields.
- Auth/security/privacy: no new client privilege is intended. Existing action RLS remains; security review must confirm no new cross-user or privileged-write path.
- Deployment/configuration/environment target: migration applied to Me+ Supabase after repository migration is committed on the DB-001 fix branch.
- Localization/time/number/currency: no change.
- Analytics/performance: replace JSON extraction on hot scheduler paths with typed/indexable fields.

## Ordered implementation

1. Inventory all live JSON execution-surface keys, dependent RPCs, constraints, indexes, and current migration history.
2. Add typed action execution-surface columns with conservative checks/defaults and partial indexes; backfill all existing action rows from JSON without deleting JSON provenance.
3. Update core scheduler/Todoist RPCs so decisions and mutations use typed columns as the authoritative execution-surface state. Keep JSON values only as a temporary compatibility/provenance mirror where needed by untouched legacy callers.
4. Update bundle/catalog helpers that create or relink action surfaces so typed state remains complete.
5. Add regression tests/verification queries covering create/update/remove/completion/reconciliation, duplicate external ID rejection, invalid state rejection, unsurfaced overdue policy behavior, and existing-row backfill parity.
6. Run Supabase advisors, database verification, repository checks, inspect final diff, perform an independent security pass, and update the engineering issue/checkpoint only after evidence is green.

## Verification strategy

- Unit/integration: database-level transactional regression cases against disposable test actions where possible; compare typed state to existing live JSON before/after migration.
- Browser/runtime: not applicable; no UI change.
- Negative/error paths: duplicate provider task ID, invalid surface state, mismatched Todoist completion ID, cross-user linkage attempts where practical.
- Accessibility/visual: not applicable.
- Performance: confirm scheduler lookups use typed columns/indexes rather than JSON extraction for execution-surface identity/state.
- Analytics: not applicable.
- Security/review: verify RLS/grants unchanged or tightened; ensure SECURITY DEFINER RPCs preserve ownership checks and no user can link another user's action.
- Release-specific: no `dev → prod` release in this task.

## Migration / rollback

- Compatibility/migration: additive columns first, backfill, then RPC updates. Do not delete legacy JSON keys in this change.
- Old/new application-data compatibility: typed columns become authoritative for updated RPCs while existing JSON remains readable for older code during the transition.
- Deploy/migration order: commit migration to the fix branch before applying it remotely; then verify live schema/RPC behavior and merge to `dev`.
- Backup/recovery point where needed: additive migration preserves existing `constraint_flags`; rollback can restore old RPC definitions and ignore/drop new columns after verification.
- Rollback/recovery: revert RPC definitions to pre-migration versions; typed columns are additive and can remain harmlessly if an emergency rollback is needed.
- Irreversible operations: none planned.

## Open decisions

- Final typed field set will be the smallest set that covers live execution-surface state and scheduler-control semantics; routine occurrence/provenance metadata remains in its existing canonical fields/JSON unless DB-001 requires it for correctness.

## Completion evidence

Pending.
