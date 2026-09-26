# Project Memory

> Complete this file when creating a project from the starter. Keep it compact and durable. Do not paste chat transcripts here.

## Identity

- **Project name:** TODO
- **Purpose:** TODO
- **Primary users:** TODO
- **Repository:** TODO
- **Owner/team:** TODO

## Architecture

- **Frontend/runtime:** TODO
- **Backend/runtime:** TODO
- **Database/storage:** TODO
- **Hosting/deployment:** TODO
- **Authentication:** TODO
- **Key architectural boundaries:** TODO

## Important paths

| Area | Path | Notes |
| --- | --- | --- |
| Main app | TODO | TODO |
| Tests | TODO | TODO |
| Database/migrations | TODO | TODO |
| Public/static assets | TODO | TODO |
| Infrastructure | TODO | TODO |

## Commands

| Purpose | Command |
| --- | --- |
| Install | TODO |
| Development | TODO |
| Test | TODO |
| Build | TODO |
| Lint/typecheck | TODO |
| Browser/E2E | TODO |
| Performance | TODO / Not used |

## Runtime environments

Branches are code-promotion lanes, not proof of runtime/data isolation.

| Runtime | Code source | Non-secret target identifiers | Data/auth isolation |
| --- | --- | --- | --- |
| Local | working branch | TODO | TODO |
| Preview/staging | TODO / Not used | TODO | TODO |
| Production | `prod` / adapted production branch | TODO | TODO |

- **Code promotion path:** `dev → prod` unless adapted in `.agents/project-policy.json`.
- **Feature-flag/config environments:** TODO / Not used.

## Verification contracts

- **Frontend runtime matrix:** TODO / Not applicable — record critical browsers/viewports/devices and any print/platform-specific checks.
- **Visual sanity contract:** TODO / Not applicable — record theme variants, semantic color/spacing token paths and the project visual-QA command/spec.
- **Performance budgets:** TODO / Not used — record measurable user-critical thresholds/config and where they are enforced.
- **Analytics contract/taxonomy:** TODO / Not used — record the durable event-contract document/config, not provider credentials.
- **Verification evidence location:** PR / CI artifacts / TODO.
- **Localization/i18n:** TODO / Not used — source locale, supported locales, fallback, timezone/date/number/currency policy, RTL if applicable.
- **Operations runbook:** TODO / Not used — deployed revision verification, health/smoke checks, observability, rollback and backup/restore where applicable. See `docs/OPERATIONS-RECOVERY.md`.

## Product / domain invariants


Record rules that agents must not accidentally change without an explicit product decision.

- TODO
- TODO

## Security boundaries

- Where authorization is actually enforced: TODO
- Where secrets live: TODO
- Tenant/user isolation model: TODO
- Sensitive data/logging restrictions: TODO
- Data classification/retention/deletion/export requirements: TODO / Not applicable
- Public ingress/webhooks/uploads and abuse/replay/rate-limit boundaries: TODO / Not applicable

## External systems

List only capabilities and non-secret identifiers. Do not store credentials.

| Capability | Provider/system | Environment/account | Notes |
| --- | --- | --- | --- |
| Source control | GitHub | TODO | TODO |
| Current docs | Context7 / official docs | Agent-host dependent | Optional/required? |
| Database | TODO | TODO | TODO |
| Hosting | TODO | TODO | TODO |

See `docs/MCP-SETUP.md`.

## Durable decisions

Link accepted ADRs rather than duplicating them.

- `docs/adr/0001-agent-independent-engineering.md`

## Known gotchas

- TODO

## Context freshness

Update this file when architecture, commands, core product invariants, runtime targets, localization contracts, operations/recovery expectations, security boundaries or external-system topology materially changes. Source/tests/accepted ADRs override stale memory.
