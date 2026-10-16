# ADR 0002: Me+ 2.0 modular core and replaceable adapters

**Status:** Proposed, 17 October 2026. User requested architecture planning; implementation and deployment are not authorized by this ADR.
**Related:** ME2-ARCH-007; [audit](../ARCHITECTURE-AUDIT-2026-10-17.md); [architecture](../ARCHITECTURE.md).

## Context

Me+ already has PostgreSQL-owned state and invariants, Next.js and Expo clients, machine Gateway and scoped MCP boundaries, source workers and optional agent packages. Its current risks are contract/provenance drift, incomplete client/session/release acceptance and N26-specific finance coupling. Multi-bank delivery adds connection isolation and finance-accuracy requirements.

## Proposed decision

1. Keep one product and canonical Supabase state. Use a modular application with explicit capability boundaries rather than a new microservice platform.
2. Retain PostgreSQL for transactional invariants, ownership, recurrence, receipts and audit; pure platform-neutral transformations may live in shared TypeScript modules. Each rule has one authoritative implementation.
3. Keep separate user-session, machine Gateway and scoped MCP authentication adapters over shared capability contracts. One policy model does not require one physical endpoint or a generic all-powerful Gateway.
4. Move reusable server/provider logic out of the web presentation tree behind a server-only module. Keep Node and Deno runtime entrypoints thin and explicit; no automatic cross-runtime import graph.
5. Use provider/institution/connection/account identities for banking. Require independent N26 and ING consent/sync controls and exact money/provenance semantics.
6. Reuse existing scheduler/dispatch infrastructure for durable outbox/lease/retry contracts first; consider Supabase Queues only for a proven gap. Use at-least-once delivery plus idempotent canonical writes.
7. Keep clients thin, with labeled cached reads and a narrowly bounded offline outbox. Server truth and conflict/version checks determine confirmed completion.
8. Keep Letta, n8n, Langfuse and any later workflow engine optional. Adopt per use case after synthetic/held-out tests, privacy/recovery and approved cost gates.
9. Keep Drive for human-readable product design, GitHub for source/plans/evidence and Supabase for runtime facts. Slack may link to those artifacts; it does not become a second roadmap or personal-state store.

## Alternatives considered

| Alternative | Assessment |
| --- | --- |
| Rebuild in another app framework | Does not address observed session, provenance or pipeline defects; discards existing native integration work |
| Split every domain into a service | Adds network/auth/deployment/monitoring boundaries before scale or team needs justify them |
| Put all logic in client/shared TypeScript | Would duplicate or weaken existing transactional database invariants and risk exposing privileged dependencies |
| Put every integration in n8n | High-trust health/banking still needs typed ownership, provenance and transactional application; existing native workers remain appropriate |
| Add Temporal immediately | Existing routine scheduling and source refresh do not yet demonstrate a need for a second workflow runtime |
| Treat bank as a provider display string | Cannot safely distinguish simultaneous N26/ING sessions, controls, accounts, limits or consent |

## Consequences

- Improves testable ownership and reuse while retaining current providers/frameworks.
- Requires a capability catalog, generated database types, runtime validation and connection identity migration before dual-bank activation.
- Extracting modules and reconciling deployment source is incremental work, not an immediate rewrite. Old/new clients and worker versions need compatibility gates.
- Preserves graceful deterministic operation when optional services fail; operating and privacy costs remain visible.
- Introduces no required infrastructure purchase. Protected mobile storage and browser acceptance tooling are candidates for later implementation.

## Adoption and reversal

Review through the documentation PR and canonical Drive section. Acceptance of the design still does not approve production changes or paid services. Implement through the [roadmap](../ROADMAP.md) using small contract-preserving changes.

If an extraction increases complexity or breaks a pinned runtime, retain the existing wrapper and tested implementation until an alternative passes. Reverse adapters/flags without rolling back canonical history. Revisit the decision only with observed operational or functional requirements.
