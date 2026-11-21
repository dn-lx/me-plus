# Multi-agent Codespace guidelines

This is a **development environment repository**, not an application repository.
Keep it small: only Codespaces provisioning, agent installation/diagnostics and clear usage documentation.

## Agent independence
- Claude Code (`claude`), OpenAI Codex (`codex`), and Antigravity CLI (`agy`) are separate official agents.
- None is required to act as an orchestrator for the others. No automatic delegation or pooled subscription quotas are configured.
- Each provider login and permission grant is independent. Do not copy authentication secrets between agents or commit credentials.
- A Codespace may sleep. Do not treat it as an always-on agent server.

## Changing project code
- Clone application repositories separately, outside this environment repo's tracked files.
- Assign each modifying agent its own branch/worktree; never let two agents modify the same dirty worktree.
- Run a project's own tests and review changes before opening PRs.
- Never deploy to production or merge protected branches without specific user authorization.
- Store reusable decisions in project docs or committed changes, not solely in an agent conversation.
