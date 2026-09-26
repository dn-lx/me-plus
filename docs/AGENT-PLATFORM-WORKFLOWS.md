# Agent Platform Workflows

This repository is designed to survive changes of coding agent. `AGENTS.md` is the canonical shared instruction file; platform-specific files only bootstrap agents into the same workflow.

## Authority

Authority is question-specific; follow `docs/DOCUMENTATION_POLICY.md`.

In particular:
- source/tests/runtime evidence describe what exists now,
- the current accepted requirement describes the intended outcome,
- Git/GitHub/CI describes branch/check state,
- verified provider reads describe current external-system state,
- Current Handoff is a recovery pointer that must be reconciled before use.

If a platform adapter conflicts with `AGENTS.md`, follow `AGENTS.md`.

## Common workflow

1. Read AGENTS, Project Memory and Current Handoff.
2. Reconcile task → branch → PR with `task-continuity` before creating/resuming implementation work.
3. Inspect the verified active branch/working tree, relevant PRs/issues and recent commits.
4. If no valid task branch exists, start ordinary work from current `dev` on a focused feature/fix/chore branch and create a draft PR early for non-trivial work.
5. Read relevant skills before specialized/sensitive work.
6. Verify required MCPs/connectors before relying on them.
7. Trace the actual code/data path and intended requirement.
8. Make the smallest complete change.
9. Run documented checks for the current candidate SHA. Never weaken checks to get green.
10. Use independent review for security/auth/payments/data/privacy/release-sensitive work.
11. Record version impact per `docs/VERSIONING.md`; merge feature/fix/chore only into `dev` and verify cleanup per `docs/BRANCH-LIFECYCLE.md`.
12. Release only through `dev → prod`; for deployed systems follow operations/recovery verification.
13. Update Current Handoff when material unfinished state would otherwise be lost.

## ChatGPT / OpenAI Codex

- Treat `AGENTS.md` as the primary persistent instruction source.
- Verify connected GitHub/apps/tools rather than assuming they exist.
- Use Agent Skills for repeatable workflows.
- Prefer a fresh reviewer/session for sensitive changes.
- Report changed files, checks, limitations and branch/PR state.

## Claude Code

- `CLAUDE.md` imports shared context; `.claude/skills/` adapters load canonical skills.
- Follow `docs/CLAUDE-GEMINI-SETUP.md` and verify loaded context/skill discovery.
- Verify active repository/branch at session start.
- Inspect MCP configuration before external-system work.
- Keep credentials out of Git.
- Use a fresh review pass/session for sensitive changes where practical.

## Gemini CLI

- `GEMINI.md` imports shared context; `.agents/skills/` supplies skills directly.
- Follow `docs/CLAUDE-GEMINI-SETUP.md` and verify loaded context/skill discovery.
- Confirm loaded project memory/instructions when needed.
- Inspect MCP status before external actions.
- Durable decisions belong in repository docs, not session history.

## GitHub Copilot

- Repository bootstrap lives in `.github/copilot-instructions.md`.
- GitHub checks/reviews are evidence; AI authorship is not review evidence.

## Cursor

- Prefer root `AGENTS.md` for universal rules.
- Add Cursor-specific rules only for genuinely conditional/path-specific behavior.

## Cline / Roo Code / Windsurf / Devin / OpenCode

- Use root `AGENTS.md` wherever supported.
- If a host does not auto-read it, bootstrap explicitly with AGENTS + Project Memory + Current Handoff.
- Keep host-specific config thin; do not create a second source of project truth.

## Onboarding another agent

An agent is safe to onboard when it can:
- read the repository and Git history,
- honor repository instructions,
- create isolated branches,
- run documented checks,
- create/review PRs,
- connect to external systems without storing secrets in Git,
- leave a durable handoff.

## Handoff minimum

Record:
- intended outcome,
- active branch/PR,
- files/components changed,
- checks/results,
- blockers,
- decisions and why,
- exact next safe step,
- external side effects,
- actions that must not be repeated.
