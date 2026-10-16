# Requirements, Issues & Execution Plan

**Status:** Active
**Last updated:** 2026-10-06
**Primary branch:** `dev`

Use this document as the project-level, checkable source of truth for requested features, known issues, planned improvements and completion evidence.

Do not use it as a chat transcript or duplicate implementation details that belong in source, tests or ADRs.

## How agents use this document

- Read this file when the task is product planning, backlog execution, bug/feature delivery, or when the user refers to "the requirements", "the plan", "the issues" or "what is left".
- If the user/task explicitly selects a requirement or issue, work on that item. Only choose the highest-priority unchecked item when asked to select/continue backlog work without a specific target, and still respect dependencies/blockers.
- Use stable requirement IDs in branches, PRs and handoffs when useful.
- Change `[ ]` to `[x]` only after the acceptance criteria are verified.
- Add concise completion evidence when marking an item done.
- Do not mark an item complete merely because code was written.
- Source/tests define current implementation facts; this file defines accepted intended outcomes while an item is active. If a requirement is stale or conflicts with an accepted ADR/invariant, reconcile the conflict explicitly instead of silently choosing one.
- Keep completed items for history unless the project has an explicit archival policy.

## Priority model

- **P0 — Correctness / security / blocking reliability**
- **P1 — Core product value / important UX**
- **P2 — Valuable enhancement**
- **P3 — Polish / optimization / future work**

Order work so lower-priority features do not depend on unreliable or incorrect foundations.

---

# Active requirements

## [x] ME2-NATIVE-001 — Reproducible and retry-safe native task writes

**Priority:** P1 · Backend / reliability

Recover exact applied source for native task create/reschedule and request deduplication. Verify owner-scoped writes, denied clients, invalid input, retry safety, routine/closed-task protection and atomic rollback in disposable PostgreSQL. Repair no-op replay so retries preserve newer edits, and isolate deduplication from unrelated event sources. No live replay or deployment is included.

Acceptance: recovered versions/statements match inspected migration history; isolated contract CI reproduces the old no-op failure then passes the repair and existing gates; independent security review has no blocker. Hosted sign-in and full app E2E remain separate acceptance.

Implementation: `docs/plans/ME2-NATIVE-001-contract-recovery.md`.

Completion evidence: PR #76 code head `31f10f4`: all seven CI gates passed; isolated PostgreSQL reproduces the old bug then passes both suites twice; independent review clear. Development implementation verified; live repair deployment and hosted app E2E are explicitly outside this requirement. Final PR head remains subject to CI.


## [ ] ME2-ARCH-007 — Evidence-based architecture and delivery plan

**Priority:** P1 · Documentation / planning

Audit current dev, prepared backend/mobile work, canonical design and deployment metadata; recommend boundaries, technology choices and a complete roadmap covering N26 and ING. Do not implement, install, activate or deploy.

Acceptance: source-linked findings, explicit current/prepared/proposed states, bank coverage assumptions and acceptance gates, prioritized dependencies, preserved design authority, consistent repository/Drive documentation and documentation checks. Evidence: [audit](ARCHITECTURE-AUDIT-2026-10-17.md), [roadmap](ROADMAP.md), proposed [ADR 0002](adr/0002-meplus2-modular-core-and-adapters.md).

## [ ] ME2-BASE-008 — Reproducible source, schema and deployment baseline

**Priority:** P0 · Infrastructure / reliability · **Dependency:** review pending PRs independently.

Reconcile active function source/digests/auth config, migration ledger, dev/prod/API targets, pending PR #77/#38 dependencies and legacy runtime disposition. Create a reproducible isolated schema/config baseline with synthetic fixtures.

Acceptance: exact deployable source identified; no unknown-source redeploy; clean environment reproduces contracts; migration provenance and compatibility verified; no historical migration replay or live-data import to repair documentation. Audit findings A01–A03.

## [ ] ME2-CONTRACT-009 — Versioned capability contracts and server module boundaries

**Priority:** P1 · Cross-platform / backend · **Dependency:** ME2-BASE-008.

Inventory owner RPCs, machine Gateway and MCP capabilities; align DTO/lifecycle/error/request-ID semantics with SQL. Generate database types and validate untrusted payloads. Extract reusable server/provider code from presentation modules while preserving Node/Deno boundaries.

Acceptance: clients and adapters use one documented capability model; schema/runtime checks agree; transactional rules have one authority; no privileged server dependency in client bundles; compatibility and regression checks cover incremental extraction. A07/A08/A13/A18.

## [ ] ME2-SEC-010 — Complete owner-session and data isolation boundaries

**Priority:** P0 · Auth / privacy · **Dependency:** ME2-BASE-008.

Finish web refresh/logout/recovery/safe return routing and account-scoped cache handling; evaluate protected native session storage. Separate user sessions from machine/scoped-client credentials and isolated tests from shared live data.

Acceptance: anonymous/cross-owner/forged-client denial, refresh/revocation/recovery and two-device isolation; no secret in a client/log; cookie-write origin protection; native session-size/error/logout behavior verified; test jobs cannot silently use live write credentials. A03/A06.

## [ ] ME2-JOBS-011 — Durable bounded work and retry semantics

**Priority:** P0 before banking activation · Backend / reliability · **Dependencies:** ME2-BASE-008, ME2-CONTRACT-009.

Persist job receipts and connection-scoped leases/generations, classify bounded retries and commit page application/checkpoints atomically. Reuse existing scheduler/dispatch infrastructure before adding a queue service.

Acceptance: crash/retry/replay/concurrent-worker and revoke/pause cases preserve data and last-success semantics; poison jobs inspectable; no network call held inside a database transaction; slow work survives the initiating HTTP response. A11.

## [ ] ME2-BANK-012 — Independent N26 and ING read-only finance integration

**Priority:** P1; security/correctness gates P0 · Finance / integrations · **Dependencies:** ME2-BASE-008 through ME2-JOBS-011 as applicable.

Deliver both banks through provider/institution/connection/account contracts, independent consent/control/sync, exact money and auditable source facts. ING Germany retail is an assumption pending country/product confirmation. Retain Enable Banking as the first candidate; verify actual capabilities, entitlements and fees.

Acceptance: both banks separately pass authorization, cutoff, account identity, pagination, decimal/balance/transaction/reversal, cross-bank transfer, crash/retry, pause/revoke, user-visible freshness and real source-sync gates. No bank credentials or payment capability. Full [banking plan](plans/ME2-BANK-012-n26-ing.md). A09–A12. Latest user request supersedes earlier N26 deferral for planning priority.

## [ ] ME2-DELIVERY-013 — Immutable web/native/backend release chain

**Priority:** P0 · Delivery / infrastructure · **Dependency:** ME2-BASE-008.

Separate frozen dependency preflight, immutable native compilation, artifact/installed verification and approved distribution. Preserve designated Windows Android builder. Verify web/backend published runtime identity and compatible migration/config rollout.

Acceptance: build performs no source/lockfile/binary commits; artifact hash/signer/source/version traceable; branch deletion safe; actual install/HTTP/auth checks pass; rollback rehearsed; specific dev→prod approval remains required. A04.

## [ ] ME2-HEALTH-014 — Device/source accuracy and incremental health acceptance

**Priority:** P1; missing migration gate P0 before device release · Health / integrations.

Reconcile PR #38 and the missing batch-run migration; inventory Health Connect/Zepp coverage, source precedence and duplicate metrics; define deletion/cursor-expiry/backfill behavior. Preserve permissions, quality and raw revisions.

Acceptance: real device grant/deny/resume/upload/retry, multiple bounded batches, revision and deletion semantics, expired cursor, Health Sync overlap and no sensitive logs. Foreground-only work is labeled honestly. Official Zepp export/API evaluation only. A05.

## [ ] ME2-CLIENT-015 — Complete daily and cross-device owner flows

**Priority:** P1 · App / web · **Dependencies:** ME2-CONTRACT-009, ME2-SEC-010.

Complete Today/Now/Review, native task/routine controls, optional helpfulness/follow-through, small check-ins and connection/privacy settings. Use canonical typed writes rather than separate client rules; support labeled cached reads and a limited request-ID outbox.

Acceptance: committed readback across two devices, session recovery, retry/version conflicts, empty/stale/offline/error states; keyboard/screen-reader/contrast and phone/tablet/desktop checks; rationale and minimum actions; no consequential offline external effects. A13/A14.

## [ ] ME2-OPS-016 — Recovery, retention, export and operational evidence

**Priority:** P0 release gate / P1 delivery · Operations / privacy.

Define core database/object/config/secret-reference backup scope, retention/deletion, data export, operational thresholds and source/runtime health. Reuse the existing observer.

Acceptance: isolated restore/export/deletion and failure/rollback drills; documented owner and actual achievable RPO/RTO; sanitized correlations; no raw private trace payloads; actionable alerts. Proposed RPO ≤24h/RTO ≤4h requires validation against plan/cost and owner expectations. A16.

## [ ] ME2-NOTIFY-017 — Useful, consented notification delivery

**Priority:** P1 · App / attention policy · **Dependencies:** ME2-CLIENT-015, ME2-JOBS-011 where asynchronous delivery is used.

Implement permission, quiet-hour, attention, deduplication, expiry and acknowledgement contracts, with minimal private lock-screen content. Delivery cannot change canonical completion truth.

Acceptance: duplicate/retry, timezone/DST, denied/expired token, multiple device and expired-action cases; actionable prompts and separate delivery/outcome metrics. A15.

## [ ] ME2-EVAL-018 — Reliable structured intelligence and measured learning

**Priority:** P1 · Reasoning / quality · **Dependencies:** baseline/source reconciliation and privacy gates.

Establish baseline output/route/cost, fail-closed handling for incomplete/invalid responses and a versioned held-out synthetic benchmark. Keep helpfulness, follow-through and actual outcomes distinct; account for small samples/selection bias.

Acceptance: no critical safety/permission/schema failures in promotion cases; bounded retries/cost/context; comparable quality/latency/tool-count evidence; no model change bundled into tracing; reproducible fallback. A17.

## [ ] ME2-AGENT-019 — Selective optional runtime acceptance

**Priority:** P2 · Optional infrastructure · **Dependencies:** ME2-EVAL-018, ME2-OPS-016.

Advance prepared Letta/n8n/Langfuse packages only for a measured use case. Require isolated identity/tools, scoped actual credentials, benefit/cost/privacy, restore/fallback and revocation acceptance. Keep skills reviewed and Temporal conditional.

Acceptance: real allowed and denied tool execution, loss-of-runtime fallback, approved model/budget, backup restore, trace canary/deletion and recoverable workflow exports. No second canonical store or routine scheduler. Preparation from PR #77 is not full adoption. A17.

## [ ] ME2-DOMAIN-020 — Small complete product-domain slices

**Priority:** P1/P2 by selected use case · App / domain capability · **Dependency:** accepted daily loop.

Reuse existing canonical data for goals/check-ins, learning/Spanish/practice, workouts/recovery, food/hydration, finance obligations and reviews. Select one useful flow at a time; preserve uncertain estimates and user corrections.

Acceptance per selected slice: factual source and derived interpretation distinguished, typed write/readback, continuity, useful UI/conversational flow, privacy/negative paths and actual usage feedback. Data-model presence alone is insufficient. A20.

## [ ] ME2-SLACK-021 — Optional scoped Slack use case

**Priority:** P2 optional · Collaboration / potential integration · **Dependency:** user selects a product use case.

Slack may link to canonical plans and review discussions. Inbound task capture or outbound product notifications require explicit selected scope, workspace/user mapping and minimum permissions. The ChatGPT connector does not provide Me+ runtime authorization.

Acceptance if selected: verified workspace/channel/recipient, authenticated events, replay/rate-limit/injection handling, no unapproved writes or private-state mirroring, disconnect/retention and tool-scope tests. No Slack message or app integration is required to complete this planning task. A21.

## [ ] ME2-CONNECT-003 — Provider and real client/device activation

**Priority:** P1 · User-assisted integration acceptance · **Dependencies:** per-source security/deployment/client gates.

Google Health Sync/Calendar need renewed provider authorization; N26 and ING need independently accepted workers and fresh bank consent; Health Connect needs actual device evidence; MCP needs a securely configured scoped client. Keep clocks off until each source's own genuine sync succeeds. OAuth-style hosted ChatGPT connection remains separate scope if needed.

Acceptance: actual fresh snapshots/uploads, bounded retry/readback, allowed/denied client operations and revocation, independent source pause/start/clock behavior, no secret leakage. Preserve this existing requirement ID from PR #77 and retain its completed preparation requirements when consolidating that PR.

Prepared foundation work ME2-BACKEND-002, ME2-INTEGRATIONS-004, ME2-SETUP-005 and ME2-AGENTS-006 is tracked in [PR #77](https://github.com/dn-lx/me-plus/pull/77). Its code/tests/deployment evidence must be preserved on merge; it does not close the new acceptance requirements above.

---

# Known issues

## [ ] ISSUE-ENG-007 — Canonical Me+ request routing is too slow

**Priority:** P0

**Observed behavior**
Known Me+ intents can trigger repeated specification, Drive, database, connector or entity discovery even when canonical identifiers already exist. This increases latency, tool usage and inconsistency across cold and resumed chats.

**Expected behavior**
Known intents use a deterministic fast path: intent/aliases → canonical specification(s) → latest relevant checkpoint → no generic Personal State by default → purpose-specific context/execution surface. Missing/stale registrations and ambiguous intents use an explicit, bounded and diagnosable fallback.

**Acceptance criteria**
- [x] Root cause identified: routing components existed but were not enforced as one system-wide default path.
- [x] Private intent-routing registry and service-only deterministic resolver deployed.
- [x] Live bootstrap v3 uses compact checkpoints and `state_scope=none` by default for known routes.
- [x] Live gateway source provenance reconciled to Edge Function 25 / `gateway-v1.17.0`.
- [x] Applied ENG-007 migration provenance reconciled exactly into repository source.
- [x] Critical `shell-quote` dependency audit blocker fixed without suppressing the advisory; current Security checks pass.
- [x] Staged guardrail covers intent/topic precedence, whole-word whitespace matching, direct issue lookup, registration validity/revalidation, bounded ambiguity and bootstrap fallback diagnostics.
- [x] Disposable PostgreSQL regression suite passes 64/64 assertions with denied-role and replay checks.
- [x] Historical live routing regression passed 12/12; no current-version routing benchmark was run in the architecture audit.
- [x] Task PR #67 merged to `dev` (GitHub merge status rechecked 17 October 2026); current runtime provenance and latency remain separate gates.
- [ ] Guardrail migration generated through the approved Supabase CLI/release workflow and deployed only after explicit reviewed dev→prod approval.
- [ ] Representative v1.17 cold/resumed interactions provide comparable p50/p95, payload-byte and observed-call evidence.

**Performance budget**
- Known intent: one gateway bootstrap operation and one gateway→database RPC for route + specs + checkpoint + state decision.
- Registered known routes default to no generic Personal State and no broad Drive/database/plugin discovery.
- Fallback discovery is explicit and bounded to at most two follow-up discovery calls.
- Database-only timings must never be reported as end-to-end user latency.

**Historical completion evidence**
The following measurements are from the earlier ENG-007 checkpoint, not a fresh runtime benchmark. PR #67, historical code head `48d2b2cc4ab43eed27712d69333f2ecfc56e2e17`. The historical gateway was Edge Function 25 / `gateway-v1.17.0` with `bootstrap-context-v3`. Isolated routing run `37590204039` reports 64 passed / 0 failed and no production access; current Security, Runtime, Version and Agent Stack workflows are green. Historical routing regression passed 12/12. Earlier comparable core measurement: `get_me_context` payload 35,704 → 6,758 bytes (-81.07%) and single-run DB execution 19.673 → 11.268 ms (-42.72%). The inspected 24-hour audit window still lacks v1.17 traffic, so end-to-end p50/p95 remains unverified.


# Execution and completion

Use [ROADMAP.md](ROADMAP.md) for dependency order and exit gates. No application implementation is authorized by this planning revision. Current-source, prepared, deployed, authorized, first-sync, recurring-accepted and released are separate statuses.

A requirement is complete only when its acceptance evidence exists. Keep runtime/deployment actions separately authorized, preserve user data/history and record tests/limits in the task PR. Proposed performance/cost/recovery targets in the roadmap need measured validation before being promised.
