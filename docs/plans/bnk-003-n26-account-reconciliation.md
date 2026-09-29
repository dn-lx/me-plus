# BNK-003 — N26 account reconciliation implementation plan

## Requirement

- Requirement/task: BNK-003 — prevent reconnect-driven duplicate N26 account/transaction normalization and repair the current duplicated live state.
- Intended outcome: one canonical normalized financial account per stable provider account identity; reconnect/session UID rotation must reuse it, and normalized transactions must not be double-counted.
- Non-goals: payment initiation, provider-refresh scheduling, BNK-001/BNK-002 concurrency work, or broad finance RLS hardening (DB-003).

## Verified current state

- Relevant paths/symbols: `apps/web/lib/finance/n26-ingest.ts`, `apps/web/lib/finance/enable-banking.ts`, `financial_accounts`, `financial_transactions`, `raw_events`.
- Existing behavior: account lookup is keyed to Enable Banking `uid`; raw record IDs include that rotating UID; normalized transaction uniqueness is scoped to `financial_account_id`.
- Live evidence: the superseded duplicate account is inactive, but 60 normalized transaction pairs still exist across the canonical and superseded rows with identical normalized payloads.
- Provider contract: Enable Banking documents `uid` as session-scoped and `identification_hash` as suitable for matching the same account across sessions.
- Existing tests/checks: repository TypeScript checks/build plus targeted finance regression coverage to be added.
- External systems/boundaries: Enable Banking read-only AISP, Supabase production Postgres, GitHub/Netlify release path.

## Affected contracts

- User-visible behavior: finance totals/history no longer double-count transactions after reconnect.
- API/data/schema: add a nullable stable provider-account identity column to `financial_accounts`; preserve the current session UID separately as `external_account_ref`; use the stable identity in reconciliation and raw-event idempotency.
- Auth/security/privacy: no new secrets; stable provider identity remains server/database state under existing ownership/RLS.
- Deployment/configuration/environment target: forward-compatible DB migration first; app code remains compatible while the new nullable column is introduced.
- Localization/time/number/currency: unchanged.
- Analytics/performance: add a selective unique index for stable account identity; no extra provider requests.

## Ordered implementation

1. Add the stable identity schema/index and a guarded data repair that removes only exact duplicated normalized transactions from the known superseded account while retaining raw provenance and the superseded account record.
2. Change N26 ingestion to resolve the provider stable identity from account/session data, seed/update it on the canonical row, match rotated UIDs by stable identity, preserve alias/reconciliation metadata, and make raw transaction IDs stable across UID rotations.
3. Add regression tests for stable identity selection/keying and live SQL integrity tests for one canonical account, zero duplicate normalized transaction groups, uniqueness enforcement, and rollback-safe negative cases.
4. Run TypeScript/build/CI plus Supabase security/performance advisors and review the final diff.
5. Update the issue register/checkpoint with verified results; production app promotion follows the repository's normal dev → prod release gate.

## Verification strategy

- Unit/integration: regression tests for stable identity and UID rotation; SQL assertions after migration/data repair.
- Browser/runtime: not a UI change.
- Negative/error paths: missing identification hash must not guess/merge unrelated accounts; duplicate stable identity must be rejected.
- Accessibility/visual: not applicable.
- Performance: verify index/advisor state.
- Analytics: not applicable.
- Security/review: confirm no secrets/raw banking credentials are added and user ownership/RLS remain intact.
- Release-specific: code must merge through the focused fix branch → dev; production promotion remains governed by the explicit dev → prod release workflow.

## Migration / rollback

- Compatibility/migration: new identity column is nullable so old app code remains valid.
- Old/new application-data compatibility: old code can continue writing rows; new code uses the added column once deployed.
- Deploy/migration order: schema/data repair before application promotion.
- Backup/recovery point where needed: migration assertions abort if duplicate pairs are not exact.
- Rollback/recovery: code can ignore the nullable column; superseded account/raw evidence is retained. Deleted normalized duplicate rows are reconstructable from retained raw/provider evidence if ever required.
- Irreversible operations: exact duplicate normalized rows are deleted only after guarded equivalence checks.

## Open decisions

- None material. The provider's documented stable account identity is the authoritative match key; no heuristic merge by masked IBAN alone will be used.

## Completion evidence

To be filled with migration/version, PR/SHA, CI/check results, SQL acceptance results, and advisor output.
