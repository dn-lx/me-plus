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

## [ ] REQ-001 — Short requirement title

**Priority:** P0 / P1 / P2 / P3  
**Scope:** App / Web / Backend / Data / Infrastructure / Cross-platform  
**Type:** Feature / Bug / Reliability / UX / Security / Maintenance

**Problem / need**  
Describe the observable problem or requested outcome in plain language.

**Goal**  
Describe the desired end state, not the implementation.

**Requirements**
- Concrete behavior 1.
- Concrete behavior 2.
- Important constraints.
- Privacy/security/accessibility expectations where relevant.
- Performance budget and analytics behavior where they are part of the user/product requirement.

**Acceptance criteria**
- [ ] Observable criterion 1.
- [ ] Observable criterion 2.
- [ ] Negative/error path verified.
- [ ] Relevant tests/checks pass.
- [ ] Browser/runtime, performance or analytics-contract evidence captured when relevant.

**UI verification contract (when applicable)**
- Theme/state(s): TODO / Not applicable.
- Critical viewport(s): TODO / Not applicable.
- Visual reference/invariant: TODO / Not applicable.
- Contrast/alignment/overflow/clipping expectations: TODO / Not applicable.

**Dependencies**
- None / REQ-XYZ / external dependency.

**Completion evidence**  
_Add PR/commit, test/build result, screenshots/device verification or other proof here before marking complete._

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
- [x] Current live routing regression remains 12/12 and system-wide read-only health shows no ENG-007 regression.
- [ ] Task PR merged to `dev` and post-merge state reverified.
- [ ] Guardrail migration generated through the approved Supabase CLI/release workflow and deployed only after explicit reviewed dev→prod approval.
- [ ] Representative v1.17 cold/resumed interactions provide comparable p50/p95, payload-byte and observed-call evidence.

**Performance budget**
- Known intent: one gateway bootstrap operation and one gateway→database RPC for route + specs + checkpoint + state decision.
- Registered known routes default to no generic Personal State and no broad Drive/database/plugin discovery.
- Fallback discovery is explicit and bounded to at most two follow-up discovery calls.
- Database-only timings must never be reported as end-to-end user latency.

**Completion evidence**  
PR #67, current head `48d2b2cc4ab43eed27712d69333f2ecfc56e2e17`. Live gateway is Edge Function 25 / `gateway-v1.17.0` with `bootstrap-context-v3`. Isolated routing run `37590204039` reports 64 passed / 0 failed and no production access; current Security, Runtime, Version and Agent Stack workflows are green. Live routing regression remains 12/12. Earlier comparable core measurement: `get_me_context` payload 35,704 → 6,758 bytes (-81.07%) and single-run DB execution 19.673 → 11.268 ms (-42.72%). The inspected 24-hour audit window still lacks v1.17 traffic, so end-to-end p50/p95 remains unverified.


## [ ] ISSUE-001 — Short issue title

**Priority:** P0 / P1 / P2 / P3

**Observed behavior**  
What currently happens?

**Expected behavior**  
What should happen?

**Reproduction / evidence**
1. Step or condition.
2. Step or condition.
3. Result.

**Acceptance criteria**
- [ ] Root cause identified.
- [ ] Fix verified against reproduction.
- [ ] Regression test added when practical.
- [ ] No relevant adjacent behavior regressed.

**Completion evidence**  
_Add verification here._

---

# Planned work / roadmap

Use this section for ordered work that is not yet detailed enough to become a full requirement.

## Phase 1 — Foundation
- [ ] PLAN-001 — Example foundational work.

## Phase 2 — Core experience
- [ ] PLAN-002 — Example product work.

## Phase 3 — Quality and release
- [ ] PLAN-003 — Example QA/release work.

Convert a plan item into a detailed requirement before implementation when scope/risk is non-trivial. If delivery sequencing, migration, rollback or handoff is also non-trivial, use the implementation-planning skill for the task-specific “how”; do not turn this requirements file into an implementation transcript.

---

# Decisions and constraints

Record decisions that materially shape execution but do not justify an ADR yet.

- Example: app and web must use one analytics contract.
- Example: background scheduling is best-effort rather than exact.
- Example: production data must never be copied into test logs.

Promote architectural/security decisions to an ADR when they become durable or cross-cutting.

# Completion summary

Use this section for a quick status view.

- [ ] P0 complete.
- [ ] P1 complete.
- [ ] P2 complete.
- [ ] P3 complete.

# Maintenance rules

- Keep requirement IDs stable after work begins.
- Do not silently change acceptance criteria after implementation; record the change.
- If a requirement is cancelled, mark it clearly as cancelled with reason/date instead of deleting it.
- If a requirement moves to another repository, leave a pointer.
- Keep this document concise enough to scan; implementation notes belong in code/PRs/handoffs.
