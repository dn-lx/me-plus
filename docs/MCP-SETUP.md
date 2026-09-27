# MCP and Connector Setup

External tool access is host-specific. This repository records capability requirements only; credentials and private tokens stay outside Git.

## Me+ capability profile

| Capability | Status | Project provider | Purpose |
| --- | --- | --- | --- |
| Source control / PRs / CI | Required | GitHub | Branches, diffs, pull requests, CI, releases, and durable engineering evidence |
| Current library/API docs | Required | Context7 / official docs | Verify framework, SDK, AI-provider, and integration behavior before implementation |
| Database/auth/storage | Required | Supabase | Durable application data, authentication, row-level policies, migrations, and optional storage |
| Hosting/deployments | Required | TBD | Preview/staging and production deployment with environment isolation |
| Browser/computer verification | Required | Playwright / browser tooling | Rendered UI, accessibility, and end-to-end verification |
| Code relationships | Optional | Graphify | Architecture and change-impact analysis as the codebase grows |
| Runtime observability | Required | TBD | Privacy-aware errors, runtime health, and integration failure diagnostics |
| Product analytics/flags | Optional | TBD | Owner-visible product telemetry only when useful |
| Payments | Not used | — | Not used |
| Transactional email | Optional | TBD | Notifications or reports when a concrete workflow requires email |
| Documents/business files | Optional | Google Drive | Supporting documents and exports; canonical structured state remains in Supabase |
| Issue/project management | Required | GitHub | Implementation work, decisions, defects, and release readiness |

## Verification before use

Before relying on any connector:
1. discover it in the current host,
2. perform a harmless read,
3. verify account/project/environment identity,
4. verify permissions,
5. perform only the authorized write.

## Me+ integration rules

- Keep canonical structured application state in Supabase; supporting documents may live in Drive.
- Treat branch names as code-promotion lanes, not proof of external environment isolation.
- Confirm the exact external project/environment before any material write.
- Use typed adapters for integrations and device ingestion so providers remain replaceable.
- Record material external writes in `docs/CURRENT-HANDOFF.md`.
- Do not commit credentials or private connector configuration.
