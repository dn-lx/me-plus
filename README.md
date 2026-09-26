# Me+

Me+ is a personal intelligence and control platform for turning durable user-owned records, goals, context, policies, connected services, and device signals into transparent, user-controlled insights and actions.

## Architecture direction

- **Frontend:** TypeScript web application under `apps/web/`.
- **Application/domain layer:** domain services own business rules; the UI stays thin.
- **Durable data:** Supabase Postgres is the canonical application-data source of truth; migrations live under `supabase/migrations/`.
- **Authentication:** Supabase Auth with explicit authorization boundaries and row-level database policies.
- **Reasoning:** model providers are replaceable reasoning dependencies, not canonical memory.
- **Integrations:** external services and device ingestion go through typed adapters and auditable writes.
- **Policies:** domain-specific policies constrain reasoning and side effects.
- **Supporting documents:** Google Drive may hold supporting documents and exports; structured canonical state remains in Supabase.

See `docs/PROJECT-MEMORY.md` for the durable architecture contract and `docs/MCP-SETUP.md` for required external capabilities.

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

## Current bootstrap status

The repository was created from Agent Project Starter. Me+-specific project memory, capability requirements, policy, and project skill are maintained in this repository. Application framework commands, hosting provider, concrete runtime environments, and product-specific CI are finalized when the first application scaffold is introduced.

## Agent startup order

1. `AGENTS.md` and `.agents/project-policy.json`
2. `docs/PROJECT-MEMORY.md`
3. `docs/CURRENT-HANDOFF.md`
4. `docs/REQUIREMENTS.md` when the task concerns product/backlog work
5. One relevant skill or workflow for the task

Current source, tests, and accepted ADRs override stale documentation or session memory.
