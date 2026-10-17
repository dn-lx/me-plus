# Me+

Me+ is a personal intelligence and control platform for turning durable user-owned records, goals, context, policies, connected services, and device signals into transparent, user-controlled insights and actions.

## Product shape

Me+ is one product with two first-class clients in a single monorepo:

- **Web:** dashboard, deep analysis, configuration, memory management, integrations and administration.
- **Mobile:** daily interaction, notifications, quick capture and platform/device integrations.
- **Shared packages:** platform-neutral domain logic, contracts, reusable UI where appropriate, configuration and reasoning interfaces.
- **Backend/data:** Supabase Postgres/Auth/Storage where needed, with repository-managed migrations and explicit row-level authorization.

## Monorepo layout

```text
apps/
  web/
  mobile/
packages/
  domain/
  contracts/
  ui/
  reasoning/
supabase/
  migrations/
tests/
```

Platform-specific capabilities stay inside their client/adapters. Shared domain code must not depend directly on browser or native APIs.

## Mobile client usage

The mobile client (`apps/mobile/`) provides daily interaction, quick capture, and device integrations:

- **Today priorities:** Authenticated owner surface displaying grouped daily priorities (Must, Should, Bonus) queried through user-scoped Supabase RLS.
- **What matters now:** Conservative suggestion ranked via shared `@me-plus/domain` logic and evaluated against current calendar windows. If calendar schedule data is unavailable or invalid, suggestions are disabled rather than assuming free capacity.
- **Action decisions:** Complete, Partial, and Skip operations invoke the canonical `record_meplus_action_decision` RPC, serialized per operation, with committed readback and account race protection.
- **Guidance:** Displays unexpired recommendations generated within the 24-hour horizon.
- **Device tools:** Quick access to live Health Connect (`/health-connect`) for watch data inventory and upload, and the pipeline test harness (`/sensor-diagnostics`) for deterministic fixture testing.


## Architecture direction

- **Clients:** thin web/mobile clients over shared services and contracts.
- **Durable data:** Supabase Postgres is the canonical application-data source of truth.
- **Authentication:** Supabase Auth with explicit authorization boundaries and row-level database policies.
- **Reasoning:** model providers are replaceable reasoning dependencies, not canonical memory.
- **Integrations:** external services and device ingestion go through typed adapters and auditable writes.
- **Policies:** domain-specific policies constrain reasoning and side effects.
- **Supporting documents:** Google Drive may hold supporting documents and exports; structured canonical state remains in Supabase.

See `docs/PROJECT-MEMORY.md` for the durable architecture contract, `docs/ARCHITECTURE.md` for package boundaries, and `docs/MCP-SETUP.md` for required external capabilities.

## Branch model

```text
feature/*  fix/*  chore/*
          ↓
        dev
          ↓
  checks + review
          ↓
dev → prod PR
          ↓
 production approval
          ↓
         prod
```

`prod` is the stable production/release branch. Ordinary implementation work targets `dev` through a temporary feature, fix, or chore branch.

## Current status

The Agent Project Starter bootstrap is complete. The web/mobile monorepo architecture is now defined. Framework-specific application scaffolding, package-manager/workspace commands, concrete hosting targets, Supabase schema, product-specific CI and the first end-to-end domain slice are the next implementation stage.

## Agent startup order

1. `AGENTS.md` and `.agents/project-policy.json`
2. `docs/PROJECT-MEMORY.md`
3. `docs/CURRENT-HANDOFF.md`
4. `docs/REQUIREMENTS.md` when the task concerns product/backlog work
5. One relevant skill or workflow for the task

Current source, tests, and accepted ADRs override stale documentation or session memory.
