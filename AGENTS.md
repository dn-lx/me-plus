# Working on this project

## Canonical instructions

This file is the canonical human-readable cross-agent working agreement. `.agents/project-policy.json` is the machine-readable branch/release/continuity contract. Platform-specific bootstrap files must stay thin and point back here rather than redefining project rules.

Before editing:

1. Read this file and `.agents/project-policy.json`.
2. Read `docs/PROJECT-MEMORY.md`.
3. Read `docs/CURRENT-HANDOFF.md`.
4. Before creating a new implementation branch or resuming interrupted work, apply `.agents/skills/task-continuity/SKILL.md` and reconcile the active task/PR/branch from GitHub evidence.
5. For product requirements, backlog execution, bugs/features, or questions about remaining work, read `docs/REQUIREMENTS.md`.
6. Classify the task, then load only the applicable superpower or repository-local skill.
7. Read `docs/AGENT-PLATFORM-WORKFLOWS.md` only for host portability/onboarding work.
8. If external systems are needed, read `docs/MCP-SETUP.md` and verify the actual connection with a harmless read.

Do not preload the full skill/superpower catalog. Progressive loading is the default context policy.

For claims about **current implementation**, source/tests/runtime evidence override stale documentation, generated summaries, cached graphs and session memory. For the **intended outcome**, follow the current accepted requirement/acceptance criteria. Use `docs/DOCUMENTATION_POLICY.md` when authorities appear to conflict.

## Branch and release rules

- `dev` is the development integration branch.
- Ordinary work starts from current `dev` on a focused `feature/*`, `fix/*` or `chore/*` branch.
- Feature/fix/chore branches merge into `dev`, never directly into `prod`.
- `prod` is production/release.
- Only this repository's `dev` branch may merge into `prod`, through the release workflow and explicit production approval.
- Never push directly to `prod`, force-push it, or bypass Git history with an ad-hoc production deployment.

Read `.agents/skills/release-workflow/SKILL.md` before creating/merging a production PR or changing production deployment policy.

## Branch cleanup and versioning

Read `docs/BRANCH-LIFECYCLE.md` and `docs/VERSIONING.md` for lifecycle work. Only `prod` and `dev` are permanent. Verify completed temporary branches are deleted after merge; preserve active/unmerged work. Every material change must identify version impact and update CHANGELOG.md when user-visible. Release preparation updates VERSION and dated notes; publish immutable tags only after approved dev → prod release. All host adapters inherit these rules.

## Engineering principles

- Trace the active code path and data flow before editing.
- Prefer the smallest complete, readable change that fixes the cause.
- Reuse existing utilities and dependencies before adding abstractions.
- Do not weaken tests, authorization, validation, error handling or secret boundaries to get green CI.
- Never expose secrets, private tokens, privileged keys or customer/user data in browser code, logs, prompts or Git.
- Treat external systems as shared/live unless documentation proves the environment is isolated.
- Automated agents may create branches and PRs; production merge remains human-controlled.

## Agent-independent orchestration

Use stable capability roles, not permanent vendor winners:

- Planner / Architect
- Executor / Implementer
- Independent Reviewer / Security Reviewer
- Multimodal / Long-context Specialist
- Fast Utility Worker

Agent/host assignment and model assignment are separate decisions. Provider/model mappings may change over time. Route by verified capability, tool/data locality and project outcomes. Default to one lead agent; add parallel workers only when work is genuinely separable. Cost is telemetry/tie-breaker, not a reason to silently downgrade required capability.

See:
- `docs/AGENT-ORCHESTRATION.md`
- `docs/EXECUTION-ROUTING-POLICY.md`
- `docs/CLI-AGENT-STACK.md` — curated Claude/Codex/Gemini/OpenCode host baseline and Claude efficiency add-ons.

## Optional CLI host profile

Local Claude Code, Codex CLI, Gemini CLI and OpenCode guidance lives in `docs/CLI-AGENT-STACK.md` and is loaded only when host setup/routing matters. Host plugins never override repository policy.

## MCP and connector policy

External capabilities are host-specific. Repository docs describe what capability is needed, not private credentials.

Before claiming an MCP/connector works:

1. discover/list it in the current agent host,
2. perform a harmless read,
3. verify the intended account/project/environment,
4. only then perform an authorized write.

Use least privilege. Record material external writes in `docs/CURRENT-HANDOFF.md`.

## Memory and context discipline

- Durable facts belong in source, ADRs, project memory or skills.
- Temporary/unfinished state belongs in Current Handoff.
- Do not use a long chat transcript as the project's memory system.
- Use Graphify/source search to identify relevant files before loading broad repository context. Some search/index tools are default-branch-scoped; before treating a hit as current truth, verify/fetch it from the active branch/SHA.
- Prefer compact, source-linked summaries and current diffs over replaying previous agent transcripts.
- Mark memory as stale when related source/architecture changed.

See `docs/MEMORY-CONTEXT-POLICY.md`.

## Task and skill routing

Keep routing progressive. For broad/stalled/end-to-end work, use `.agents/skills/task-routing/SKILL.md` to select one primary Superpower from `.agents/superpowers/`. Do not preload the Superpower/skill catalog.

Direct fast paths:
- resume/branch uncertainty → `task-continuity`;
- host/model/parallelism choice → `execution-routing`;
- non-trivial delivery sequencing → `implementation-planning`;
- test harness/regression architecture → `test-engineering`;
- focused UI defect (contrast/alignment/overflow/clipping/responsive) → `frontend-verification` **without** the full design stack unless visual direction changes;
- substantial redesign/UX direction → `design-stack`; load `motion-runtime` only when runtime animation is justified;
- performance or analytics changes → `performance-budget` / `analytics-contract`;
- sensitive trust boundaries → `security-boundary-review`;
- risk-based verification → `quality-gates`;
- degraded/broken production → `recover-production` + `docs/OPERATIONS-RECOVERY.md`;
- release preparation/mechanics → `release-readiness` / `release-workflow`.

When no direct path is obvious, consult `.agents/SKILL-INDEX.md` on demand. The index includes `project-bootstrap`, `mcp-usage`, `context7`, `graphify`, `memory-context`, `code-hygiene`, `dependency-maintenance`, `headroom-pilot`, `accessibility-visual-regression` and the remaining specialist skills.

Before adding another tool/skill, check `docs/STACK-RESPONSIBILITY-MAP.md`. When the right document is unclear, consult `docs/INDEX.md` on demand. For substantial frontend design read `docs/DESIGN-STACK.md`; for repository cleanup/context optimization read `docs/CODE-HEALTH-AND-CONTEXT.md`.

## Requirements and execution-plan discipline

`docs/REQUIREMENTS.md` is the checkable product/backlog plan for the consuming project. Keep requirement IDs stable once work begins. Use the plan when implementing product work, bugs or planned improvements. Mark `[x]` only after the item's acceptance criteria are verified and add concise completion evidence. Do not mark work complete merely because code was written. If scope changes materially, update the requirement before or alongside implementation.

For non-trivial work where implementation order, migration, external boundaries or handoffs matter, use `implementation-planning` and `docs/templates/IMPLEMENTATION-PLAN-TEMPLATE.md`. Requirements define **what** must be true; the implementation plan records **how** the task will be delivered and verified. Do not create plan files for tiny obvious changes.

The requirements plan is not part of the default static startup context for unrelated tasks; load it when the task needs it.

## Required verification

The project must define its actual test/build/lint/typecheck commands in Project Memory and CI.

For review-specific guidance, use `REVIEW.md` in addition to the relevant quality/security skills.

For every material change:
- run the smallest relevant deterministic checks,
- add/adjust tests for changed behavior,
- use `test-engineering` when the harness or regression strategy itself needs work,
- use `frontend-verification` for material frontend changes; source inspection alone is not sufficient evidence,
- enforce documented performance budgets when the change can materially affect user-perceived performance,
- verify the analytics contract when instrumentation/events/flags change,
- inspect the final diff,
- report anything that could not be verified; use `docs/templates/VERIFICATION-EVIDENCE-TEMPLATE.md` when a compact reproducible evidence packet helps.

For auth, permissions, secrets, payments, data models, worker command execution, external writes or production changes, perform an independent security/review pass and negative-path checks where practical.

## Host adapters

For Claude Code or Gemini CLI setup, use `docs/CLAUDE-GEMINI-SETUP.md`. Keep `.agents/skills/` canonical. When changing skill metadata or inventory, regenerate Claude discovery adapters with `node scripts/sync-claude-skills.mjs --write` and validate them. Gemini reads the canonical directory directly. Do not copy credentials or blanket permission overrides between hosts.

## Universal continuity

An open branch is not automatically an active task. For non-trivial work, bind the task to one writable branch and a draft/open PR, and keep the machine-readable task state in `docs/CURRENT-HANDOFF.md` valid. GitHub/source/check evidence overrides handoff or chat memory.

At the beginning of a new coding-agent session, read Project Memory and Current Handoff. Before ending unfinished work, or after a material architectural decision/external side effect, update `docs/CURRENT-HANDOFF.md`.

Plans, ADRs, tests, PR descriptions and review findings belong in GitHub so the next agent can continue without relying on one chat's hidden memory.
