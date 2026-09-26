# Claude Code and Gemini CLI setup

These adapters target Claude Code and Gemini CLI. For the broader curated Claude/Codex/Gemini/OpenCode host stack and the Claude efficiency plugin profile, read `docs/CLI-AGENT-STACK.md`. Selecting a Claude or Gemini **model inside Cline/OmniRoute** does not change the host into Claude Code/Gemini CLI: use Cline's project instructions and verify it reads AGENTS.md. Model routing does not transfer ChatGPT connectors, credentials or filesystem access.

## Shared setup

1. Use the current dev revision; prod may lag until an approved release. Start the CLI from the repository root.
2. Install/sign in using the chosen CLI's official setup. Run `claude --version` or `gemini --version` when diagnosing compatibility.
3. Review the workspace before accepting the host trust prompt. Keep normal permissions enabled; do not use blanket auto-approval to make setup pass.
4. Fill the consuming project's Project Memory commands and MCP profile. TODO entries are unconfigured, not passing checks.
5. Run `node scripts/validate-docs.mjs`, `node scripts/validate-agent-stack.mjs`, `node scripts/context-budget.mjs --check`, `node scripts/sync-claude-skills.mjs`, `node scripts/validate-version.mjs` and `node --test tests/*.test.mjs`.

## Claude Code

- Start `claude` in the repo root. CLAUDE.md explicitly imports only shared instructions, memory and handoff, including for sessions without native AGENTS.md loading. Platform workflow and specialist guidance are loaded on demand.
- Use `/memory` or `/context` to inspect loaded context. Confirm the actual branch/version rules and current handoff.
- Skills are discovered through `.claude/skills/<name>/SKILL.md`. Try `/quality-gates` and confirm Claude reads `.agents/skills/quality-gates/SKILL.md`. Committed adapters avoid Windows symlink requirements and contain no copied procedures.
- Use `/mcp` to inspect connections; configure credentials privately in the host. Complete a harmless read against the intended account/project before writing.
- After changing canonical skill metadata or adding/removing skills, run `node scripts/sync-claude-skills.mjs --write` and commit adapters with the source change. CI detects drift. Obsolete/custom adapters require explicit review; the script does not silently delete/overwrite them.

## Gemini CLI

- Start `gemini` in the repo root. GEMINI.md imports the same compact shared context; platform workflow and specialist guidance are loaded on demand.
- Use `/memory show` to inspect instructions; `/memory reload` refreshes them.
- Use `/skills list` to confirm shared `.agents/skills/` discovery, and `/skills reload` after edits. No duplicate Gemini skill tree is needed. If skills are missing, check workspace trust and the installed CLI's skill settings.
- Use `/mcp` and perform the same harmless account/project verification.

## First-session acceptance prompt

> Read the loaded project instructions and relevant files. Without changing files or external services, report the current repository/branch, planned version, allowed merge path, required checks, relevant skills, and which external connections you have actually verified. Identify TODO configuration and missing access honestly. Explain how you will preserve active branches and record a handoff.

The answer must reflect current VERSION, feature → dev → approved prod flow, canonical skills and actual commands. Claiming a connector works solely because a document mentions it fails this check.

## Boundaries and troubleshooting

- If imports are ignored, explicitly open AGENTS.md, Project Memory and Current Handoff before editing; load Platform Workflows only when the task concerns host behavior/onboarding; check CLI version/configuration against official docs.
- Repository instructions guide behavior; GitHub rulesets enforce branch protections. Adapters do not grant repository-settings access.
- Login, local CLI installation, MCP authentication and live skill activation must be verified on the machine running that host. Static CI cannot prove them.
- Keep local preferences, settings and machine MCP configuration out of Git. Share reviewed credential-free examples separately if needed.
- Do not run two agents against the same dirty working tree. Use separate branches/worktrees and commit a handoff before switching ownership.

## Official references (last checked 2026-09-22)

The date below is a historical verification point, not a compatibility guarantee. Re-check current official host documentation before changing installation, permission, import, skill or MCP configuration.

- Claude memory/imports: https://code.claude.com/docs/en/memory
- Claude skills: https://code.claude.com/docs/en/skills
- Gemini context/imports: https://geminicli.com/docs/cli/gemini-md/
- Gemini skills: https://geminicli.com/docs/cli/skills/

Repository validation covers imports, adapter drift and safeguards. Live Claude/Gemini activation is not claimed until verified in those hosts.
