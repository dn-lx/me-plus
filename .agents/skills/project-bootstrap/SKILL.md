---
name: project-bootstrap
description: Adapt Agent Project Starter into a real project without losing the shared agent-independent workflow.
---

# Project Bootstrap

Use this skill immediately after generating a new repository from the starter.

## Preferred path: deterministic bootstrap

1. Copy `bootstrap.config.example.json` to an untracked/local bootstrap config and fill the real project identity, architecture, commands, paths, branch names and connector capability decisions.
2. Preview the write set with `node scripts/bootstrap-project.mjs --config <config.json> --dry-run`.
3. Run `node scripts/bootstrap-project.mjs --config <config.json>`.
4. The generator updates `.agents/project-policy.json`, `docs/PROJECT-MEMORY.md`, `docs/MCP-SETUP.md`, creates `.agents/skills/<project-slug>/SKILL.md`, and removes the obsolete `project-template` skill/adaptor.
5. Regenerate Claude adapters with `node scripts/sync-claude-skills.mjs --write`.
6. Complete the remaining project-specific items below that cannot be inferred safely from configuration.

The bootstrap generator must not invent credentials, runtime identities, production state, security guarantees, CI commands, or external-system targets. Use `Not configured`, `Not applicable`, or `Not used` until verified.

## Remaining project setup

1. Replace starter examples in `docs/REQUIREMENTS.md` with accepted project requirements and acceptance criteria.
2. Confirm `dev` and production `prod` (or the configured equivalents) exist and are protected; configure task continuity/draft PR recovery.
3. Add actual project CI/test/build commands; use `test-engineering` when the project needs a harness and do not leave fake-green CI.
4. For frontend projects, define the browser/runtime verification matrix, theme variants and semantic color/spacing token source; add Playwright/browser tooling where useful.
5. Define measurable performance budgets when performance is user-critical, and define a privacy-safe analytics event contract when analytics is enabled.
6. Record actual runtime environment identities. For production runtime/data, adapt the operations runbook with deployed-revision verification, health/smoke checks, observability, rollback and backup/restore.
7. Record localization/time/number/currency rules when the project supports multiple locales or user-facing regional formatting.
8. Confirm generic security workflows fit the stack and add project-specific checks where needed.
9. Verify startup context stays within budget and use task-context packets when broad tasks repeatedly load excessive files.
10. Run `node scripts/validate-docs.mjs --strict-project`, `node scripts/validate-agent-stack.mjs`, and the project-specific test/build/typecheck checks.
11. Ask a fresh agent to explain project architecture, test commands, branch flow, MCP capabilities, security boundaries and release path. Fix any ambiguity it exposes.

Never copy credentials or machine-specific MCP tokens into the repository.
