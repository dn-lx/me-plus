# REQ-SCHED-046 — History-aware daily planning

Status: implementation and isolated verification. Production activation is not authorized by this development change.

## Outcome

Choose a realistic workload before assigning times. Reasoning explicitly selects, reduces, defers or omits flexible occurrences using recent confirmed activity, goals, preferences, allowed versions and capacity. Deterministic code protects commitments, permissions, recurrence, dependency order, quiet hours and conflicts. Persist accepted decisions, exclusions, evidence, feedback and uncertainty.

## Verified baseline

The current hourly backend materializes due daily routines and calls `private.meplus_balance_day_actions` before reasoning. The balancer mainly counts tasks per window. The reasoning worker and its three-item Guidance contract do not own a daily-plan output. The Todoist dispatcher can currently process materialized tasks before AI finishes. Dev and production APIs share the canonical database; a Git branch is not an isolated data environment.

Canonical design: Me+ Intelligence Contract, Daily Life/Routines/Action Engine, Supabase Schema/Security, and Scheduler/Automation Behavior Specification (routed through private.resolve_specs). Dynamic personal records must not be committed to this public repository.

## Delivery

1. Provider-independent planning contract, deterministic compiler and explicit-feedback history summaries.
2. Bounded snapshot/read, validation/commit and feedback RPCs; versioned plan decisions with ownership/RLS; default-disabled policy.
3. Dedicated daily-planning branch within the existing reasoning worker. Preserve Guidance and authenticated comment handling.
4. Integrate candidate preparation, selective legacy-balancer bypass, plan-aware Todoist gating and idempotent reconciliation.
5. Deterministic scenarios, adversarial outputs, historical cutoff, DST, security and database integration tests using synthetic fixtures only.
6. Read-only comparison with live schema; staged deployment instructions and rollback. No ad-hoc production deployment or dev-to-prod merge.

## Acceptance

- [ ] Full candidate accounting: do/reduce/defer/omit and protected keep/review.
- [ ] Capacity and effort constraints, configured variants, protected downtime and no overlap.
- [ ] Explicit user edits, started/near-term work, essential/treatment routines and deadlines remain protected.
- [ ] Occurrence-scoped deferrals persist without deleting routines or inventing completion.
- [ ] Accepted plans govern optional placement and surfacing; no pre-reasoning race.
- [ ] Sparse feedback remains low-confidence; expiry/removal is not intentional skipping; no completion-time-as-duration inference.
- [ ] Replay, stale context, ownership, malformed model output and safe fallback tests pass.
- [ ] Isolated database/worker integration evidence recorded.
- [ ] Post-deployment model-to-database-to-Todoist acceptance (requires reviewed release/activation).

## Rollout and compatibility

Additive migration first with planner mode disabled, then deploy the compatible worker, then shadow mode without external changes. Compare decisions and inspect errors before explicitly enabling live mode in a checksum-valid scheduler policy. Keep a previous policy version and the legacy balancer. Roll back the policy to disabled; never delete historical plans, feedback or completion evidence. Preserve expiry and user-directed removals during rollback.

## Limits

This iteration learns from stored context and explicit feedback; it does not retrain model weights or run unapproved experiments. Historical replay cannot prove a counterfactual plan would have been followed. Unsupported recurrence types and unconfigured treatment changes are not guessed. Longitudinal usefulness requires subsequent real outcomes.
