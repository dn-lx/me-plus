---
name: me-plus
description: Project-specific durable guidance for Me+.
---

# Me+

## Purpose
Me+ is a personal intelligence and control platform that turns durable user-owned records, goals, context, policies, connected services, and device signals into transparent, user-controlled insights and actions.

## Source of truth
- Read `AGENTS.md` first.
- Use `docs/PROJECT-MEMORY.md` for durable architecture, commands, and boundaries.
- Use `docs/CURRENT-HANDOFF.md` for unfinished task state.
- Use `docs/REQUIREMENTS.md` for accepted requirements.
- Use `docs/ARCHITECTURE.md` for monorepo ownership boundaries.

## Architecture
- `apps/web` and `apps/mobile` are first-class clients of the same Me+ system.
- Client UIs stay thin and delegate to shared application/domain services.
- Platform-neutral domain logic and contracts live under `packages/`.
- Browser- or native-only capabilities stay behind typed adapters and do not leak into shared domain code.
- Supabase is the durable application-data source of truth.
- Model providers are replaceable reasoning dependencies, not canonical storage.
- Integrations and device ingestion use typed adapters and auditable writes.
- Domain policies constrain reasoning and actions before external side effects.

## Branch flow
- Integration: `dev`
- Production: `prod`
- Ordinary work: temporary feature/fix/chore branch → `dev`
- Release: `dev` → `prod` only after required checks and explicit approval.

## Project rule
Do not invent missing architecture, credentials, external-system identity, or production state. Verify against current source, runtime, and tool evidence.
