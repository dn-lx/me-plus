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
- API/data/schema: replace broad `ALL` policies with operation-specific source-aware policies/grants; add append-only correction history; add narrow correction RPCs.
- Auth/security/privacy: authenticated direct mutation is denied for integration-owned/derived rows. SECURITY DEFINER correction functions must enforce `auth.uid()`, field allow-lists, ownership and immutable provenance fields, with explicit EXECUTE grants only.
- Deployment/configuration/environment target: repository migration committed to the DB-003 branch and applied to the live Me+ Supabase project; no `dev → prod` release.
- Localization/time/number/currency: no change.
- Analytics/performance: policies use indexed owner/source columns; no expected material runtime cost.

## Ordered implementation

1. Replace generic own-row ALL policies/grants on the affected tables with explicit SELECT and source-aware manual-write policies. Make derived snapshots client read-only.
2. Add append-only `fact_corrections` history with authenticated own-row SELECT only.
3. Add narrow authenticated correction RPCs for financial transactions, financial accounts, observations and documents. Each RPC records before/after values and an `audit_events` row before changing current normalized state.
4. Keep raw/provider identity, source IDs, raw-event links and ownership immutable to authenticated callers.
5. Add database regression tests for allowed manual writes, denied source-backed writes/deletes, denied cross-user changes, allowed correction RPCs, disallowed correction fields, correction-history persistence and function privilege boundaries.
6. Run live transactional tests, Supabase security/performance advisors, repository Runtime validation, final diff and independent security review; merge only with current-head evidence.

## Verification strategy

- Unit/integration: transactional SQL regression suite against disposable rows; no test residue.
- Browser/runtime: not applicable.
- Negative/error paths: direct source-backed INSERT/UPDATE/DELETE; cross-user correction; protected field patch; anonymous access; direct correction-history writes.
- Accessibility/visual: not applicable.
- Performance: confirm source-aware policy predicates use simple nullable source columns and owner IDs.
- Analytics: not applicable.
- Security/review: verify grants + policies + EXECUTE privileges as separate layers; verify SECURITY DEFINER functions enforce ownership and fixed search path.
- Release-specific: `dev` integration only.

## Migration / rollback

- Compatibility/migration: existing source-backed rows are unchanged. Server-side ingestion continues through service-role access. Manual rows remain direct-client editable where explicitly allowed.
- Old/new application-data compatibility: current N26/Health ingestion uses admin clients and remains compatible. No current client code directly mutates the protected normalized tables.
- Deploy/migration order: add correction table/functions, then tighten policies/grants in the same atomic migration.
- Backup/recovery point where needed: no destructive data rewrite is planned.
- Rollback/recovery: restore previous policies/grants and remove new RPC/table only if required; existing fact data remains untouched.
- Irreversible operations: none planned.

## Open decisions

- Correction RPC field allow-lists will be deliberately conservative: user-enrichment/correctable normalized values only, never ownership/source/provider/raw identity fields.

## Completion evidence

Pending.
