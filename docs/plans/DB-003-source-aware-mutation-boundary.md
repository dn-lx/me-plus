# DB-003 — Source-Aware Imported/Normalized Fact Mutation Boundary

## Requirement

- Requirement/task: DB-003 — imported/normalized fact mutation boundary.
- Intended outcome: authenticated clients can still read their own normalized facts, but cannot directly overwrite or delete integration-derived/derived records. Manual rows remain safely editable where direct CRUD is appropriate. Corrections to protected facts go through narrow audited RPCs that preserve provenance/history.
- Non-goals: redesign ingestion pipelines, change provider sync cadence, create a new finance/health UI, or promote `dev` to `prod`.

## Verified current state

- Relevant tables: `data_sources`, `financial_accounts`, `financial_transactions`, `financial_snapshots`, `observations`, `documents`, plus already-strict `raw_events` and `document_facts`.
- Existing behavior: the first six tables use generic authenticated own-row `ALL` RLS and authenticated INSERT/UPDATE/DELETE grants. `raw_events` and `document_facts` are already client read-only.
- Live data: all 2 finance accounts, 60 finance transactions and 103 observations are source-backed; documents/snapshots currently have no rows. Data-source kinds include `manual`, `bank_account_feed`, `health_sensor`, and `conversation`.
- Existing server writers: N26 and Health Connect ingestion use `createAdminClient()` / Supabase secret-key access, so restricting authenticated writes will not block those server-side flows.
- External systems/boundaries: production Me+ Supabase project `wbqnctrvxohxwiaignhg`; GitHub repo `dn-lx/me-plus`; no production branch promotion in this task.

## Affected contracts

- User-visible behavior: no intended visible regression. Users retain read access to their own facts and may correct protected normalized facts through audited RPCs.
- API/data/schema: replace broad `ALL` policies with operation-specific source-aware policies/grants; add append-only correction history; expose corrections through an authenticated server API backed by service-role-only typed RPCs.
- Auth/security/privacy: authenticated direct mutation is denied for integration-owned/derived rows. The bearer-authenticated server API supplies the verified user ID to service-role-only SECURITY DEFINER correction functions with fixed search paths, field allow-lists, ownership predicates and immutable provenance fields.
- Deployment/configuration/environment target: repository migration committed to the DB-003 branch and applied to the live Me+ Supabase project; no `dev → prod` release.
- Localization/time/number/currency: no change.
- Analytics/performance: policies use indexed owner/source columns; no expected material runtime cost.

## Ordered implementation

1. Replace generic own-row ALL policies/grants on the affected tables with explicit SELECT and source-aware manual-write policies. Make derived snapshots client read-only.
2. Add append-only `fact_corrections` history with authenticated own-row SELECT only.
3. Add a bearer-authenticated correction API backed by service-role-only typed RPCs for financial transactions, financial accounts, observations and documents. Each correction records before/after values and an `audit_events` row before changing current normalized state.
4. Keep raw/provider identity, source IDs, raw-event links and ownership immutable to authenticated callers.
5. Add database regression tests for allowed manual writes, denied source-backed writes/deletes, denied cross-user changes, allowed correction RPCs, disallowed correction fields, correction-history persistence and function privilege boundaries.
6. Run live transactional tests, Supabase security/performance advisors, repository Runtime validation, final diff and independent security review; merge only with current-head evidence.

## Verification strategy

- Unit/integration: transactional SQL regression suite against disposable rows; no test residue.
- Browser/runtime: not applicable.
- Negative/error paths: direct source-backed INSERT/UPDATE/DELETE; authenticated/anonymous execution of server correction RPCs; mismatched user/entity correction; protected field patch; direct correction-history writes.
- Accessibility/visual: not applicable.
- Performance: confirm source-aware policy predicates use simple nullable source columns and owner IDs.
- Analytics: not applicable.
- Security/review: verify grants + policies + EXECUTE privileges as separate layers; verify correction RPCs are service-role-only, use fixed search paths and enforce the server-supplied verified user ID against entity ownership.
- Release-specific: `dev` integration only.

## Migration / rollback

- Compatibility/migration: existing source-backed rows are unchanged. Server-side ingestion continues through service-role access. Manual rows remain direct-client editable where explicitly allowed.
- Old/new application-data compatibility: current N26/Health ingestion uses admin clients and remains compatible. No current client code directly mutates the protected normalized tables.
- Deploy/migration order: add correction table/functions, then tighten policies/grants in the same atomic migration.
- Backup/recovery point where needed: no destructive data rewrite is planned.
- Rollback/recovery: restore previous policies/grants and remove new RPC/table only if required; existing fact data remains untouched.
- Irreversible operations: none planned.

## Open decisions

- Resolved: correction field allow-lists are deliberately conservative—user-enrichment/correctable normalized values only, never ownership/source/provider/raw identity fields.
- Resolved: authenticated clients do not execute SECURITY DEFINER correction RPCs directly. Corrections enter through `POST /api/facts/correct`, which verifies the bearer token and invokes service-role-only RPCs with the verified user ID.
- Resolved: active N26 and Health Connect ingestors preserve fields marked in `userCorrectedFields` so a later provider refresh cannot silently erase an explicit user correction.

## Completion evidence

- Live migrations applied and mirrored: `20260929125850_fix_db_003_source_aware_fact_mutation_boundary`, `20260929130131_fix_db_003_manual_transaction_policy_scope`, and `20260929130941_harden_db_003_corrections_behind_server_boundary`.
- Source-backed/derived client mutation is restricted on `data_sources`, `financial_accounts`, `financial_transactions`, `financial_snapshots`, `observations`, and `documents`; existing raw/document fact read-only boundaries remain intact.
- `fact_corrections` is append-only to clients and stores before/after values, changed fields, source provenance and reason; correction events are also written to `audit_events`.
- Durable regression test `supabase/tests/db_003_source_aware_fact_mutation.sql` passed from repository content against live Supabase and rolled back with zero test document/correction residue.
- Regression coverage includes denied source-backed update/delete, protected-column denial, derived snapshot denial, direct correction-history denial, retained manual CRUD, service-only correction execution, correction/audit history, disallowed fields and mismatched-user denial.
- Supabase security advisor has no DB-003-specific findings after hardening. The temporary authenticated SECURITY DEFINER warnings were eliminated by the server boundary.
- Supabase performance advisor has no DB-003-specific missing-FK-index findings after adding correction provenance indexes.
- Implementation SHA `7666a2776ce5b10b96ab16dbe60db1ee328cab67` passed hosted Runtime validation: workspace typecheck, web build and mobile-web bundle. Semgrep and dependency audit passed. Repository-wide Agent/Version/Gitleaks remain on the same pre-existing baseline failures seen before DB-003.

