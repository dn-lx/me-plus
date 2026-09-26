# Documentation Policy

## Authority depends on the question

Do not use one universal “source of truth” ordering for every question.

| Question | Highest-authority evidence |
| --- | --- |
| What does the system do **now**? | Current source, tests and runtime evidence |
| What **should** this task/product do? | Current explicitly selected requirement/acceptance criteria and confirmed product decision |
| What architectural/security constraints remain in force? | Accepted ADRs, Project Memory invariants and repository policy |
| What branch/PR/check state exists now? | Git/GitHub/CI evidence |
| What is the state of an external system now? | A verified read from that system/provider |
| What unfinished step should be resumed? | Current Handoff only after reconciling it with Git/GitHub/source |

A current implementation is evidence of the present state, not a reason to override an accepted requirement that intentionally changes that state. Conversely, a stale requirement must not be used to invent behavior that source/tests show has already changed.

When a new requirement intentionally conflicts with an accepted ADR or durable invariant, surface the conflict and update/supersede the decision as part of the work rather than silently ignoring either side.

## Update documentation when a change affects

- architecture,
- routes/APIs/contracts,
- environment variables,
- external integrations/MCP capabilities,
- auth/authorization,
- database/schema,
- deployment/release,
- important user-visible workflows,
- durable product/business rules,
- agent tooling/workflow,
- project commands,
- security boundaries.

Tiny copy/style changes that do not alter behavior usually do not require architecture documentation.

## Where information belongs

- **AGENTS.md:** universal working contract.
- **Project Memory:** durable current project facts.
- **Current Handoff:** recent/unfinished state.
- **Implementation plan:** task-specific delivery sequence/rollback/verification for non-trivial work; not product intent.
- **ADR:** important architectural decision and rationale.
- **Agent Skill:** repeatable specialist workflow.
- **Analytics contract/taxonomy:** durable provider-neutral event definitions when analytics is used.
- **Verification evidence:** exact task/release check results and artifacts when a durable evidence packet is useful.
- **Operations/runbook:** runtime identity, health/smoke, observability, rollback, backup/restore and incident recovery for deployed systems.
- **Documentation map:** on-demand routing to maintained documentation; not another source of policy.
- **README:** human onboarding and project entry point.
- **PR/issue:** task-specific discussion/review history.

Avoid duplicating the same rule across multiple files.

## Consistency validation

Run `node scripts/validate-docs.mjs` after documentation/policy changes. It checks internal repository references, document/skill indexes and configured branch terminology.

After creating a real project from the starter, run `node scripts/validate-docs.mjs --strict-project` to catch unresolved starter placeholders. Strict mode is intentionally not used by the starter itself.

External links/upstream APIs are not treated as permanently valid merely because the local validator passes; verify current upstream documentation when the task depends on them.

## Documentation quality

Agents updating docs must inspect actual source/diffs/tests first. Never invent system behavior, credentials, endpoints or successful verification.
