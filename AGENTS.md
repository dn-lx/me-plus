# Multi-agent Codespace rules

This repository provisions independent developer tools. It is **not** an application or an orchestrator.

## Three separate agents
- Claude Code (`claude`), Codex (`codex`) and Antigravity (`agy`) run independently.
- Never merge subscription credentials, impersonate another provider or silently call an agent from another agent.
- Use `scripts/project.sh add <repository>` to create three distinct Git worktrees. Make code changes only in your assigned worktree.
- The environment repository itself should contain only setup, diagnostics, launchers and instructions.
- If two agents work on the same product, coordinate with Git commits and reviewed pull requests, **not** by editing the same dirty directory.

## Required safeguards
- Inspect a project's `AGENTS.md`, `CLAUDE.md` and equivalent instructions before touching its code.
- Never print, copy, commit, or transmit access tokens, cookies, keys or other secrets.
- Never change a protected `main`/`master`/`prod` branch directly or deploy production without explicit approval.
- Prefer the target project's integration branch (`dev` if present), create feature branches, run appropriate tests, review the diff and summarize remaining failures.
- Never bypass approvals, disable security checks, or auto-approve tool execution just to accelerate coding.
- Don't change another agent's branch/worktree or delete preserved historical work.
- A running terminal/tmux session can outlive a browser tab, but not a stopped or rebuilt Codespace.

## Handoffs
Record completed changes and test commands in the relevant project's commits/PRs. For cross-agent review, ask a different agent to inspect the diff in **its own clean worktree** before applying any suggested edits. The user chooses when to launch each agent.
