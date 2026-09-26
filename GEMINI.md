# GEMINI bootstrap

@./AGENTS.md
@./docs/PROJECT-MEMORY.md
@./docs/CURRENT-HANDOFF.md

The imports supply only the compact startup context. Do not redefine it here; load platform workflows, MCP guidance, Superpowers and specialist skills only when the task requires them.

For broad/stalled/end-to-end work, use `task-routing` to select one primary `.agents/superpowers/` workflow. Discover on-demand skills directly from `.agents/skills/`. Do not maintain a second copy in `.gemini/skills/`. Inspect `/memory show` and `/skills list` before relying on context or skills.

For setup or missing context/skills, read `docs/CLAUDE-GEMINI-SETUP.md`. Inspect `/mcp` and verify connections before external work. Host settings and permissions still apply.

After a context reset or agent switch, re-read Current Handoff and inspect current Git state. Keep durable decisions in repository docs, not private session memory.
