# Native action contract recovery

**17 October 2026 reconciliation:** the later shared migration ledger includes repair version `20261016084240`, and PR #77 records its source mapping and deployment acceptance. The pre-deployment statements below describe the original PR #76 scope. This architecture audit read migration metadata only; it did not re-verify exact applied SQL equivalence or replay anything. Preserve the provenance mapping and inspect PR #77 before any later rollout.

Task: ME2-NATIVE-001. Recover the already-deployed task creation and rescheduling contract and verify it in an isolated database before adding app controls. Scope extended after independent review reproduced two existing retry defects: no-op requests lack receipts, and replay lookups include unrelated event sources.

Verified state: on 16 October 2026, the shared Me+ database records migrations 20261015154529, 20261015154605 and 20261015154633. Their statements are absent from dev. Both public functions allow authenticated callers and reject anon; they derive ownership from auth.uid().

Delivery: recover exact recorded migration statements and versions; add disposable PostgreSQL fixtures and role-switch contract tests; require CI and independent security review; merge to dev. Add an additive CLI-generated repair for both defects and prove the no-op regression fails before the repair. No live migration replay, production promotion, model-routing change or user-data mutation is included.

Verification covers anonymous/missing actor denial, owner creation, cross-user read/write denial, user-scoped request replay, invalid fields/windows, routine/closed-action protection and rollback when event insertion fails. Reapply all three migrations and rerun tests. Fixtures exercise actual recovered function bodies with minimal tables and auth.uid(); they do not prove hosted Auth/JWT transport, the full production schema/triggers or concurrent request scheduling.

Compatibility: signatures remain unchanged. The repair records an audit event for a no-op request with a request ID; its first response reports replayed=false and supplies event_id/no_change=true. Subsequent retries report replayed=true without overwriting later edits. These files reconcile existing history; do not apply them as new migrations to the shared backend. The repair migration is not applied to the shared database. Release must review and apply only the new repair after reconciling already-applied versions; do not replay the recovered migrations. Rollback can restore the prior function bodies, retaining audit events. No irreversible data operations. User-facing app controls and full authenticated E2E remain follow-up work.

Version impact: patch maintenance. No new telemetry or performance-sensitive application path.

## Completion evidence

PR #76, code head `31f10f4`: all seven CI gates passed (isolated PostgreSQL, workspace runtime, dependency audit, secret scan, Semgrep, version and agent policy). PostgreSQL tests reproduce the old no-op bug, then pass ownership/rollback and replay/source-scope suites twice after repair. Independent review found no blocker. Local Node suite: 95 passed, 7 skipped, 0 failed. Final docs/whitespace commit requires fresh CI. Live deployment, hosted JWT/schema and concurrency acceptance remain unverified.
