# ME2-SETUP-005 — Native occurrence lifecycle and configuration readiness

User scope: finish backend setup before app/website implementation; provider authorization and N26 remain deferred. No optional paid infrastructure or app deployment.

Acceptance: expire only stale, positively identified native routine actions during local awake hours, including disabled and ended schedules; preserve execution history, manual/legacy tasks and external surfaces. Serialize cleanup against action decisions, recheck locked state, and atomically write expiry audit and occurrence state. Exclude elapsed internal native snapshots from the active workspace without deleting history. Expose owner-only current database configuration readiness with app/device/provider acceptance explicitly separate.

Implementation: two additive migrations, private reconciler, existing native clock/refresh integration, bounded workspace filter and owner readiness RPC. Berlin is the only installed native clock timezone coverage claimed. Existing worker/model routing and provider clocks remain unchanged.

Validation: rollback owner/isolation/history/sleep/idempotency tests, injected audit failure rollback, independent security source review, real PostgreSQL 17.6 concurrent completed/partial/skipped decisions versus cleanup in hosted CI. No real user activity or provider authorization is required for these checks.

Rollout: source checkpoint and successful hosted checks before applying additive migrations. Verify owner configuration, grants, original row counts and inactive external clocks. Do not deploy fixtures or concurrency seeds to the shared backend. If rollback is required, restore preceding workspace/refresh/native clock definitions and revoke readiness RPC; retain audit/history data. No destructive data rollback.

Status: source reviewed; isolated SQL contracts pass; hosted concurrency and live application pending.
