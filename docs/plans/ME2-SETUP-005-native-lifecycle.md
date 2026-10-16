# ME2-SETUP-005 — Native occurrence lifecycle and configuration readiness

User scope: finish backend setup before app/website implementation; provider authorization and N26 remain deferred. No optional paid infrastructure or app deployment.

Acceptance: expire only stale, positively identified native routine actions during local awake hours, including disabled and ended schedules; preserve execution history, manual/legacy tasks and external surfaces. Serialize cleanup against action decisions, recheck locked state, and atomically write expiry audit and occurrence state. Exclude elapsed internal native snapshots from the active workspace without deleting history. Expose owner-only current database configuration readiness with app/device/provider acceptance explicitly separate.

Implementation: two additive migrations, private reconciler, existing native clock/refresh integration, bounded workspace filter and owner readiness RPC. Berlin is the only installed native clock timezone coverage claimed. Existing worker/model routing and provider clocks remain unchanged.

Validation: rollback owner/isolation/history/sleep/idempotency tests, injected audit failure rollback, independent security source review, real PostgreSQL 17.6 concurrent completed/partial/skipped decisions versus cleanup in hosted CI. No real user activity or provider authorization is required for these checks.

Rollout: source checkpoint and successful hosted checks before applying additive migrations. Verify owner configuration, grants, original row counts and inactive external clocks. Do not deploy fixtures or concurrency seeds to the shared backend. If rollback is required, restore preceding workspace/refresh/native clock definitions and revoke readiness RPC; retain audit/history data. No destructive data rollback.

Status: deployed and verified 16 October 2026. Live migrations `20261016123952` / `20261016123953`; source filenames match deployed versions. Prior authored versions were 122906 / 123233 and were not separately deployed.

Evidence: [hosted readiness run](https://github.com/dn-lx/me-plus/actions/runs/38901981341) passed at `d06f06d`: Node 112 passed / 7 skipped, PostgreSQL 17.6 rollback contracts and three real concurrent decision cases, artifact packaging checks. Injected expiry-event failure rolled back both action/occurrence in the disposable DB. Live lifecycle rollback acceptance passed without fixture DDL or persistent synthetic records. Owner readiness returned `backend_configuration_ready=true`, all 13 owner APIs/service/private boundaries/native clock verified; evidence scope remains current database configuration. One profile, zero actions/routines; native empty clock invocation returned ok. External clocks remain disabled. No real provider/client/device acceptance claimed.

App implementation can consume `get_meplus_backend_readiness()` alongside `get_meplus_workspace()` and `get_meplus_integration_status()`. Sign-in/onboarding, physical device upload/retry and actual scoped client acceptance belong to the next stage. Google authorization and N26 deployment/consent remain deferred by the user. Optional hosts remain unprovisioned.

Post-deploy advisors: the new owner-only readiness RPC is intentionally SECURITY DEFINER and appears in the [authenticated definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_authenticated_security_definer_function_executable); auth.uid ownership and denied-role tests enforce access. The new provenance index is initially unused on the empty task database. Existing private deny-by-default RLS notices and leaked-password-protection setting are unchanged. No blocking new advisor finding.
