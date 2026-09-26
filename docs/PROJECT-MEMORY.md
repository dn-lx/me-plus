# Project Memory

> Generated from `bootstrap.me-plus.json`. Keep this compact and durable; update it when architecture or operating contracts materially change.

## Identity

- **Project name:** Me+
- **Purpose:** A personal intelligence and control platform that turns durable user-owned records, goals, context, policies, connected services, and device signals into transparent, user-controlled insights and actions.
- **Primary users:** The owner of the Me+ system; keep the architecture extensible without assuming a multi-tenant product.
- **Repository:** dn-lx/me-plus-app
- **Owner/team:** dn-lx

## Architecture

- **Clients:** First-class TypeScript web and mobile applications in one monorepo.
- **Web role:** Dashboard, deep analysis, configuration, memory management, integrations and administration.
- **Mobile role:** Daily interaction, notifications, quick capture and platform/device integrations such as health/sensor data.
- **Shared layer:** Domain logic, contracts, reusable UI where appropriate, configuration and reasoning interfaces live under `packages/` and must not depend on platform-specific APIs.
- **Backend/runtime:** Shared application/domain services plus narrowly scoped server-side functions; AI providers are reasoning dependencies, not the system of record.
- **Database/storage:** Supabase Postgres is the durable source of truth; repository-managed migrations; Storage only where needed.
- **Hosting/deployment:** To be selected after web/mobile framework scaffold; keep providers replaceable.
- **Authentication:** Supabase Auth with explicit authorization boundaries.
- **Key boundaries:** `apps/web` and `apps/mobile` stay thin. Platform-native capabilities sit behind typed adapters. Shared domain code talks to contracts, not browser/native APIs. Supabase owns canonical state. Models reason over retrieved context but do not own canonical state. Domain policies constrain reasoning and external side effects.

## Important paths

| Area | Path |
| --- | --- |
| Web app | `apps/web/` |
| Mobile app | `apps/mobile/` |
| Shared packages | `packages/` |
| Tests | `tests/` |
| Database/migrations | `supabase/migrations/` |
| Web assets | `apps/web/public/` |
| Mobile assets | `apps/mobile/assets/` |
| Infrastructure | `supabase/` and deployment configuration |

## Commands

| Purpose | Command |
| --- | --- |
| Install | TBD during monorepo scaffold |
| Development | TBD during monorepo scaffold |
| Test | TBD during monorepo scaffold |
| Build | TBD during monorepo scaffold |
| Lint/typecheck | TBD during monorepo scaffold |
| Browser/E2E | TBD during monorepo scaffold |
| Performance | TBD after UI scaffold |

## Runtime environments

- **Code promotion path:** `dev → prod`.
- Branches are code-promotion lanes, not proof of runtime/data isolation.
- Record concrete local, preview/staging and production targets before external writes.
- Web and mobile may deploy through different providers, but they share the same product contracts and backend data model.

## Product invariants

- Web and mobile are clients of one Me+ system, not independent products.
- Canonical user state lives in Supabase, not local client storage or model-provider memory.
- Shared domain logic must remain platform-neutral.
- Native/mobile sensor access is isolated behind adapters with explicit user permission and auditable ingestion.
- AI-generated insights and actions are derived state; user-owned source data remains independently inspectable and editable.

## Security boundaries

- Authorization is enforced through user ownership and row-level database policies; privileged operations stay server-side.
- Deployment and repository environment stores hold credentials; never commit them to Git or client bundles.
- Single-owner first, while preserving explicit ownership in schema and policies so future multi-user support remains possible.
- Private records are private by default; minimize collection, redact logs, separate raw observations from derived insights and require explicit authorization for external writes.
- Mobile permission grants do not imply permission to persist or share all accessible device data; ingest only data required by an explicit Me+ workflow.

## External systems

See `docs/MCP-SETUP.md` for the capability profile. Credentials remain outside Git.

## Durable decisions

- `docs/adr/0001-agent-independent-engineering.md`
- `docs/ARCHITECTURE.md`

## Context freshness

Source, tests and accepted ADRs override stale memory.
