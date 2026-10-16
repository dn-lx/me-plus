# ME2-BANK-012 — N26 and ING account-information integration

**Status:** proposed implementation plan, 17 October 2026. Documentation only.
**Requirements:** ME2-BANK-012, with ME2-BASE-008 / ME2-CONTRACT-009 / ME2-SEC-010 / ME2-JOBS-011 dependencies.

## Outcome and scope

Deliver independently controlled **N26 and ING** account, balance and transaction ingestion into the existing canonical finance model. Preserve ownership, fresh-start cutoffs, source provenance, corrections and historical evidence. The planning assumption is personal retail accounts in Germany; confirm ING country and desired account products before coding its provider mapping.

Initial scope is read-only AIS. Payment initiation, brokerage trading, card credentials, screen scraping and collecting bank passwords/PINs/TANs are excluded. A request for banking integration does not grant an agent authority to move money.

The prior N26 deferral is superseded in planning priority by the latest user request. No consent flow, provider registration, credential change, spend, migration or deploy is performed by this plan.

## Verified baseline

- `packages/contracts/src/index.ts`: banking types allow only institution `n26`.
- `apps/web/lib/finance/enable-banking.ts`: reusable provider request/session functions exist; authorization fixes N26/DE and requests 179 days.
- `apps/web/lib/finance/n26-ingest.ts`: source/consent/account/transaction/run handling; stable account identity helper; rejects non-N26 DE sessions; decimal amounts become JavaScript numbers.
- `apps/web/app/api/finance/n26/`: connect, callback and manual sync. Callback schedules initial work using `after()`; no durable completion guarantee is established by that mechanism.
- `netlify/functions/n26-sync-background.mts`: Node background worker imports the web module and selects sources by provider plus display name. Supabase owns the current planned clock; the old N26 runbook's Netlify daily schedule and unconditional 90-day import are stale.
- [PR #77](https://github.com/dn-lx/me-plus/pull/77) prepares source cutoff guards and functions-only artifacts; its N26 runtime remains recorded as deployment-pending. Current planning did not verify a new Netlify rollout or bank session.
- PR #77's integration-control migration keys control/runtime by provider and requires a single configured source per provider/owner. Two banks using `enable-banking` need a connection-level contract before activation.

### Provider decision

**First candidate: retain Enable Banking** and generalize the existing adapter. Its official documentation provides institution discovery (`GET /aspsps`), authorization/session APIs and bank-specific maximum consent validity. Historical official integration notes list both N26 DE and ING DE. That supports evaluation; it does not prove current application entitlements or support for every ING product.

Before selecting a provider, record:

| Gate | Required evidence |
| --- | --- |
| Institution | Exact provider ASPSP identity, country, retail/business type, production/sandbox behavior and any bank API variant |
| Products | Requested current/savings/card account coverage; securities or loans explicitly supported or marked unavailable |
| Access | Own-account eligibility, application activation, jurisdiction/contractual permissions, data-use/retention terms and exact callback registration |
| Limits | Bank-supported consent duration, refresh/rate limits, history/date rules, account pagination and required PSU context |
| Operations | Incident/status visibility, reauth/revoke behavior, support and provider-change process |
| Cost | Current quoted/verified fees and hosting/backup total; no blanket claim of free production access |

If the candidate fails either bank's gate, compare a small set of regulated AIS alternatives against the same matrix. Keep the provider interface stable and explicitly approve any cost/provider change. Do not substitute a ChatGPT banking plugin or reverse-engineered bank login for a server integration.

## Target contracts

Names below are conceptual; reuse or extend existing tables and RPCs after the schema inventory. Do not pre-create a parallel finance schema.

| Concept | Identity and rules |
| --- | --- |
| Provider | Connectivity implementation, initially `enable-banking`; credentials remain in a server secret store |
| Institution | Verified provider institution reference + country + customer type; display name is never an authorization key |
| Connection | Owner + provider + institution + local connection UUID; permits independent N26/ING sessions and future multiple accounts |
| Credential/session reference | Private, revocable and versioned; no raw session/access identifier in public status, logs or exported plans |
| Consent | Bound to owner/connection/scopes/provider proof; actual provider expiry; revocation increments the connection generation |
| Account | Canonical owner account ID with provider aliases/history; institution/currency-qualified matching survives reauthorization |
| Sync job | Connection ID, generation, bounded window, request/receipt ID, cursor/checkpoint, attempt/lease, outcome and safe error classification |
| Source fact | Source/account/transaction identity + revision/provenance; exact amounts/currency, booking/value times and raw evidence |
| Interpretation | User correction, category/recurrence/transfer candidate or derived cash-flow assessment; never overwrites provider evidence |

Public capability examples: list own connections, start consent, read status, request refresh, pause and revoke. Bind every mutation/probe/job to the owned connection and request ID. Keep machine wakes authenticated separately from the owner's UI session. Do not copy PR #77's Google proof implementation into banking without checking actual banking consent/session semantics.

### Connection lifecycle

Use explicit dimensions rather than one overloaded "connected" flag:

- Setup: unsupported / configuration-pending / runtime-verified.
- Consent: required / authorizing / valid / expired / revoked.
- Scheduling: paused / manual-only / recurring-enabled.
- Sync health: never-synced / queued / running / current / stale / failed.

An example connection may have valid consent, paused scheduling and stale data simultaneously. Clock enable requires that connection's genuine successful sync after its activation; one bank's success cannot satisfy another bank's gate.

### Authorization and durable callback

1. Validate owner session and institution allowlist at start; protect cookie-based writes from cross-site requests and rate-limit repeated starts.
2. Persist a short-lived, single-use nonce bound to owner, local connection, institution, callback origin/environment and request ID. Sign opaque state; keep raw private values out of URLs and logs.
3. Request only read scopes and bank-supported consent validity. Match the callback's authorized institution and account scope against the stored request; never trust the label supplied by the browser.
4. Atomically consume state and persist the authorized session reference plus durable initial-sync receipt. Redirect promptly to an honest pending status. A repeated callback resumes/returns a receipt or is denied safely.
5. Fetch provider pages outside DB transactions. Validate each bounded page and apply its records plus cursor/checkpoint atomically through a server-only boundary.
6. Mark complete/last-success only after every required page/account is reconciled. A partial attempt is visible and retryable without erasing known-good state.

Legacy N26 connect/callback/manual-sync/background routes must enforce the same runtime readiness, ownership, cutoff and pause/revoke generation rules. A gated settings RPC alone is insufficient if another entrypoint starts unguarded work.

## Finance correctness

- Preserve decimal strings or an equivalent exact representation through validation into PostgreSQL numeric; document sign and currency scale. Do not use floating-point arithmetic for canonical totals.
- Record balance type and provider as-of time. Booked and available balances differ; an ambiguous fallback is labeled unknown rather than silently treated as settled money.
- Preserve booked, pending, corrected, reversed and refunded states. Avoid double counting pending-to-booked replacements; a weak fingerprint alone must not merge unrelated same-value transactions.
- Qualify transaction identifiers by canonical account/provider identity; retain alias changes across reauthorization. Ambiguous account matches require review and never cross owner, bank or currency.
- Recognize N26↔ING own-account transfers as linked candidates for cash-flow/spending views while retaining both ledger facts. Reconcile FX legs, fees, card settlement and reversals explicitly; no automatic uncertain netting.
- Keep user categories/corrections separate from provider values so refreshes preserve user edits and audit history.
- Capture the source's fresh-start cutoff before activation. Compare booking/value dates by a documented bank-specific rule and Europe/Berlin day semantics. Never reintroduce pre-reset personal history by fallback to the old 90-day default.
- A bounded overlap after the cutoff may reconcile late postings and revisions. Detect partial history/capability limits and explain them. Balance snapshots are not fabricated historical transactions.

## Ordered implementation packages

1. **B0: discover.** Complete the capability matrix for both banks and document bank/account assumptions, fees and provider decision.
2. **B1: isolate contracts.** Add shared connection/DTO/runtime validation contracts; extract reusable server logic from the web tree. Keep current N26 APIs compatible through explicit wrappers.
3. **B2: migrate additively.** Map existing N26 source/session/account identities into the connection model. Introduce connection-scoped controls/leases/receipts and protected credential references. Review constraints/indexes/RLS and schema baseline before generating migrations.
4. **B3: durable N26.** Replace callback best-effort work with the durable job path, guard every existing entrypoint and prove cutoff/identity/precision/retry contracts against synthetic fixtures.
5. **B4: ING adapter.** Add verified institution selection and ING-specific account/balance/transaction normalization fixtures. Generalize only the common provider operations; retain explicit institution capability differences.
6. **B5: owner controls.** Build independent connection/status/last-success/pause/refresh/revoke UI with masked account identity and honest pending/partial states. Prepare reauth and unsupported-product messages.
7. **B6: later rollout and consent.** Deploy compatible database contracts, then worker, then UI; verify hosted version/denial markers. Obtain consent and validate each bank separately. Enable a clock only after that connection's successful bounded import.
8. **B7: interpretation.** Add corrected categories, recurring-obligation and transfer-aware cash-flow views after ingestion accuracy is accepted. Bank records remain usable without AI.

## Acceptance matrix

| Area | Required cases |
| --- | --- |
| Authorization | Anonymous/cross-owner denial; institution/country mismatch; expired/replayed state; callback origin/environment mismatch; invalid provider session; no credential logging |
| Independence | N26+ING simultaneously; multiple accounts; pause/revoke/reauth one connection without changing another; shared-provider lock and rate-limit behavior |
| Durability | Crash after callback exchange, after page apply and before acknowledgement; duplicate wake; expired lease; provider timeout/429/5xx; dead-letter and manual retry; no DB transaction around network I/O |
| Financial data | Positive/negative and exact-decimal amounts; currency isolation; pending/booked transitions; refunds/reversals; missing/changed IDs; pagination; same-value transactions; internal transfers and fee/FX legs |
| Fresh start | Cutoff edge dates, future start, missing/malformed dates, late booked facts, UTC/Berlin boundary, bounded overlap and unsupported history window |
| Lifecycle | Cancelled bank authorization, partial account access, consent expiry/revocation, source generation change during work, safe disconnect and deletion/export |
| User experience | Masked account labels; data-as-of and partial/stale state; consent separately from scheduling; first sync separately from recurring acceptance; mobile/browser callbacks |
| Runtime | Reproducible artifacts, exact hosted contract marker, denied unauthorized wakes, source-level evidence and separately authorized real consent/sync |

## Compatibility, deployment and rollback

Use expand → migrate → verify → switch → retire. Preserve existing N26 endpoints as bounded compatibility wrappers until their callers move. Do not change existing source or transaction IDs blindly, rewrite personal history, enable a second clock or mass-reactivate old consents.

Migration must preserve existing corrections/audit records and map source/account aliases deterministically. Old and new clients may coexist while reading the same canonical data. Feature-flag each connection's new worker path; only one scheduler owns a connection's recurring work.

Rollback disables the affected connection's clock and worker generation, retains raw evidence/jobs/receipts and restores the last compatible adapter. Revoke provider sessions through the supported operation when required. Do not roll back by dropping finance tables or deleting legitimate transactions. Test failure after partial migration and after partial sync before rollout.

## Open decisions and completion

- ING country/products, provider entitlements and recurring cost remain unverified; confirm before implementation.
- Choose exact schema changes after the baseline audit; the conceptual model above is not an approved migration.
- Choose refresh cadence from provider limits and useful freshness. The existing N26 daily intent is a starting point, not an assumed ING entitlement.
- Core backup/restore, retention and owner consent remain independent release gates.

No implementation acceptance is checked off in this plan. Completion requires evidence for **both banks**; inability to support one bank produces an explicit blocked requirement and alternative plan, not a completion claim.

## References

- [Enable Banking API](https://enablebanking.com/docs/api/reference/) and [historical ING DE/N26 DE integration notes](https://enablebanking.com/blog/2024/11/06/changelog-october-2024).
- [N26 direct TPP requirements](https://support.n26.com/en-eu/security/open-banking-psd2/psd2-open-banking-for-third-party-providers) and [ING PSD2 access](https://www.ing.de/hilfe/psd2/). Direct bank access has regulated-provider conditions; using an aggregator still requires verifying Me+'s permitted account/application setup.
- [Architecture audit](../ARCHITECTURE-AUDIT-2026-10-17.md), [roadmap](../ROADMAP.md), and [legacy N26 reference](../N26-OPEN-BANKING.md).
