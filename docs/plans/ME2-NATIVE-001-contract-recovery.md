# Native action contract recovery

Task: ME2-NATIVE-001. Recover the already-deployed task creation and rescheduling contract and verify it in an isolated database before adding app controls.

Verified state: on 16 October 2026, the shared Me+ database records migrations 20261015154529, 20261015154605 and 20261015154633. Their statements are absent from dev. Both public functions allow authenticated callers and reject anon; they derive ownership from auth.uid().

Delivery: recover exact recorded migration statements and versions; add disposable PostgreSQL fixtures and role-switch contract tests; require CI and independent security review; merge to dev. No live migration replay, production promotion, model-routing change or user-data mutation is included.

Verification covers anonymous/missing actor denial, owner creation, cross-user read/write denial, user-scoped request replay, invalid fields/windows, routine/closed-action protection and rollback when event insertion fails. Reapply all three migrations and rerun tests. Fixtures exercise actual recovered function bodies with minimal tables and auth.uid(); they do not prove hosted Auth/JWT transport, the full production schema/triggers or concurrent request scheduling.

Compatibility: signatures and live behavior remain unchanged. These files reconcile existing history; do not apply them as new migrations to the shared backend. Rollback is reverting source/test changes only. No runtime deployment is required for this recovery. User-facing app controls and full authenticated E2E remain follow-up work.

Version impact: patch maintenance. No new telemetry or performance-sensitive application path.
