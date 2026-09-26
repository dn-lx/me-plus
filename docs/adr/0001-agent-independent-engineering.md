# ADR 0001: Agent-independent engineering workflow

**Status:** Accepted

## Context

Coding agents, model providers and host applications change quickly. Project safety and continuity should not depend on one agent's private memory, one vendor-specific prompt file or one connector implementation.

## Decision

The project uses:

- `AGENTS.md` as the canonical shared working agreement,
- thin platform adapters,
- repository-owned Project Memory and Current Handoff,
- Agent Skills for repeatable specialist workflows,
- capability-based MCP documentation,
- capability-based model routing,
- source/tests/ADRs as higher authority than model/session memory,
- isolated branch/PR workflow,
- deterministic checks plus independent review for sensitive work.

## Consequences

### Positive
- agents can be replaced with less workflow drift,
- context survives across sessions/tools,
- external integrations remain replaceable,
- security/release rules are repository-owned,
- token/context use is reduced through compact memory and targeted retrieval.

### Trade-offs
- documentation requires maintenance,
- each new project must complete the bootstrap checklist,
- external MCP availability still depends on the active agent host/account,
- generic starter workflows must be adapted to the actual technology stack.
