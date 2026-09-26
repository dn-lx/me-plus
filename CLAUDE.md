# CLAUDE bootstrap

@AGENTS.md
@docs/PROJECT-MEMORY.md
@docs/CURRENT-HANDOFF.md

The imports supply only the compact startup context. Do not redefine it here; load platform workflows, MCP guidance, Superpowers and specialist skills only when the task requires them.

For broad/stalled/end-to-end work, use `task-routing` to select one primary `.agents/superpowers/` workflow. Load applicable skills from `.claude/skills/`; these adapters point to canonical `.agents/skills/` sources. Read the canonical file before acting and resolve bundled resources from its directory. Inspect loaded context with `/memory` or `/context`.

For setup or missing context/skills, read `docs/CLAUDE-GEMINI-SETUP.md`. For the curated Claude efficiency profile (Ponytail, external Superpowers, Code Review, optional claude-mem and optional Obsidian skills), read `docs/CLI-AGENT-STACK.md`. These plugins never override `AGENTS.md` or `REVIEW.md`. Inspect `/mcp` and verify connections before external work. Host settings and permissions still apply.

After a context reset or agent switch, re-read Current Handoff and inspect current Git state. Keep durable decisions in repository docs, not private session memory.
