# Project Memory

> Maintained current project facts; original bootstrap metadata predates the implemented stack. Keep this compact and distinguish proposed design from runtime evidence.

## Identity

- **Project name:** Me+
- **Purpose:** A personal intelligence and control platform that turns durable user-owned records, goals, context, policies, connected services, and device signals into transparent, user-controlled insights and actions.
- **Primary users:** The owner of the Me+ system; keep the architecture extensible without assuming a multi-tenant product.
- **Repository:** dn-lx/me-plus
- **Owner/team:** dn-lx

## Architecture

- **Clients:** Next.js/React web and Expo/React Native Android in one TypeScript monorepo, managed by pnpm.
- **Web role:** Dashboard, deep analysis, configuration, memory management, integrations and administration.
- **Mobile role:** Daily interaction, notifications, quick capture and platform/device integrations such as health/sensor data.
- **Shared layer:** Domain logic, contracts, reusable UI where appropriate, configuration and reasoning interfaces live under `packages/` and must not depend on platform-specific APIs.
- **Backend/runtime:** Shared application/domain services plus narrowly scoped server-side functions; AI providers are reasoning dependencies, not the system of record.
- **Database/storage:** Supabase Postgres is the durable source of truth; repository-managed migrations; Storage only where needed.
- **Hosting/deployment:** Netlify web/Node functions and Supabase Edge Functions. Android compilation uses the designated Windows GitHub Actions runner. Published runtime identity and installed-device acceptance require explicit verification.
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
| Install | pnpm install --no-frozen-lockfile (current CI; tightening planned) |
| Development | pnpm dev:web / pnpm dev:mobile |
| Test | pnpm test:integration |
| Build | pnpm build:web |
| Typecheck | pnpm typecheck |
| Browser/device E2E | Owner/provider/device acceptance remains pending; roadmap defines gates |
| Documentation | node scripts/validate-docs.mjs / node scripts/task-state.mjs --check |
| Performance | Roadmap targets are proposed; no current user-latency guarantee |

## Runtime environments

- **Code promotion path:** `dev → prod`.
- Branches are code-promotion lanes, not proof of runtime/data isolation.
- The canonical Supabase project is shared by dev/production. Reconcile source/migration/deployment provenance before writes; use synthetic isolated fixtures for acceptance.
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

## Planning baseline

- N26 and ING are both required by the 17 October 2026 planning request. Read-only AIS, independent connection controls and fresh-start policy; exact ING country/product coverage remains a gate.
- PR #77 contains further backend/control/MCP and optional runtime preparation. Source prepared, deployed, authorized and user-accepted are distinct states; current GitHub/runtime evidence overrides old summaries.
- Optional Letta/n8n/Langfuse remain replaceable and gated by measured benefit, least privilege, recovery/privacy and approved cost. ChatGPT plugins do not supply Me+ runtime credentials automatically.
- Proposed modular-core refinements and complete execution order: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE-AUDIT-2026-10-17.md`. This planning request does not authorize implementation.

## Durable decisions

- `docs/adr/0001-agent-independent-engineering.md`
- `docs/ARCHITECTURE.md`
- Proposed, not yet implemented: `docs/adr/0002-meplus2-modular-core-and-adapters.md`

## Context freshness

Source, tests and accepted ADRs override stale memory.
