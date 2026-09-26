# Project Memory

> Generated from `bootstrap.me-plus.json`. Keep this compact and durable; update it when architecture or operating contracts materially change.

## Identity

- **Project name:** Me+
- **Purpose:** A personal intelligence and control platform that turns durable user-owned records, goals, context, policies, connected services, and device signals into transparent, user-controlled insights and actions.
- **Primary users:** The owner of the Me+ system; keep the architecture extensible without assuming a multi-tenant product.
- **Repository:** dn-lx/me-plus-app
- **Owner/team:** dn-lx

## Architecture

- **Frontend/runtime:** TypeScript web application; responsive control surface for dashboard, domains, memory, insights, integrations, and settings.
- **Backend/runtime:** TypeScript server/API layer plus narrowly scoped server-side functions; AI providers are reasoning dependencies, not the system of record.
- **Database/storage:** Supabase Postgres as the durable source of truth; repository-managed migrations; Storage only where needed.
- **Hosting/deployment:** To be selected after application scaffold; keep deployment provider replaceable.
- **Authentication:** Supabase Auth with explicit authorization boundaries.
- **Key boundaries:** UI → application/domain services → data/memory + policy/reasoning + integrations. Model providers reason over retrieved context but do not own canonical state. Integrations and device ingestion pass through typed adapters and auditable writes. Domain policies constrain reasoning and actions.

## Important paths

| Area | Path |
| --- | --- |
| Main app | `apps/web/` |
| Tests | `tests/` |
| Database/migrations | `supabase/migrations/` |
| Public/static assets | `apps/web/public/` |
| Infrastructure | `supabase/` and deployment configuration |

## Commands

| Purpose | Command |
| --- | --- |
| Install | TBD during application scaffold |
| Development | TBD during application scaffold |
| Test | TBD during application scaffold |
| Build | TBD during application scaffold |
| Lint/typecheck | TBD during application scaffold |
| Browser/E2E | TBD during application scaffold |
| Performance | TBD after UI scaffold |

## Runtime environments

- **Code promotion path:** `dev → prod`.
- Branches are code-promotion lanes, not proof of runtime/data isolation.
- Record concrete local, preview/staging, and production targets before external writes.

## Security boundaries

- Authorization is enforced through user ownership and row-level database policies; privileged operations stay server-side.
- Deployment and repository environment stores hold credentials; never commit them to Git or client bundles.
- Single-owner first, while preserving explicit ownership in schema and policies so future multi-user support remains possible.
- Private records are private by default; minimize collection, redact logs, separate raw observations from derived insights, and require explicit authorization for external writes.

## External systems

See `docs/MCP-SETUP.md` for the capability profile. Credentials remain outside Git.

## Durable decisions

- `docs/adr/0001-agent-independent-engineering.md`

## Context freshness

Source, tests, and accepted ADRs override stale memory.
