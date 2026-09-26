# Memory and Context Policy

The goal is high-quality agent work without repeatedly paying the context cost of rediscovering the project.

## Three memory layers

### Durable project memory
Store stable architecture, commands, invariants, security boundaries and important paths in `docs/PROJECT-MEMORY.md` or ADRs.

### Working handoff
Store current branch/task state, blockers, checks and next step in `docs/CURRENT-HANDOFF.md`.

### Episodic engineering memory
Past fixes should be recoverable from Git history, PRs/issues, tests and concise source-linked notes. Do not duplicate full chat transcripts into permanent memory.

## Progressive context loading

Startup context should be limited to the canonical working agreement, compact Project Memory and Current Handoff. Do not automatically load platform workflows, MCP policy, every skill or every superpower.

After startup:
1. classify the task,
2. select one primary Superpower or the smallest directly relevant skill,
3. inspect Git status/diff/history,
4. use exact source search or Graphify before broad reads; if a search/index is default-branch-scoped, re-fetch candidate files from the active branch/SHA before treating them as current evidence,
5. open only relevant source/tests and conditional specialist guidance,
6. broaden only when evidence requires it.

Use `scripts/context-budget.mjs` to estimate and guard static startup context. For a broad task packet, use `scripts/context-packet.mjs` with the exact files you intend to load. Both estimates are deliberately approximate; their purpose is regression control and routing discipline, not billing reconciliation.

## Freshness

Memory is supporting context, not authority.

When a memory claim depends on source:
- link it to files/ADRs/commits where practical,
- revalidate it if those areas changed,
- remove or update stale claims.

Current source/tests and accepted ADRs win.

## Context budget

Avoid:
- whole-repository dumps by default,
- generated folders,
- dependency directories,
- binary assets unless required,
- repeated copies of the same docs,
- entire prior agent transcripts.

Prefer:
- compact startup memory,
- one selected superpower or skill,
- one small task packet instead of a broad directory dump,
- repository/module summaries only when needed,
- relevant source,
- current diff,
- failing test/error or screenshot,
- specific project rules.

For visual bugs, start from the screenshot/reproduction + affected component/styles + `frontend-verification`. Do not load the full design stack or unrelated pages unless the defect shows a system-wide cause.

Do not spend context describing tools/skills that are not being used for the current task.

## Retry guard

For automated agent loops:
- cap repair retries,
- fingerprint repeated failures,
- stop/escalate when the same failure repeats,
- avoid asking multiple models to rediscover identical context.

## Review packets

Independent reviewers normally need:
- requirement,
- diff,
- relevant source,
- project rules,
- deterministic check results.

They normally do not need the implementer's full transcript.

## Optional context compression

Headroom or equivalent compression tooling is optional. Use it only after targeted retrieval, compact memory and Graphify/source narrowing are insufficient.

Any pilot must compare context/usage savings against correctness, review findings, repair rounds and task success. Compression must never become the sole evidence for security, authorization, migrations or exact API/schema behavior.

See `.agents/skills/headroom-pilot/SKILL.md` and `docs/CODE-HEALTH-AND-CONTEXT.md`.

## Semantic/long-term memory tools

External memory services are optional. They must never become more authoritative than Git/source/docs. Prefer local/repository-owned memory for durable engineering facts.

### claude-mem and Obsidian

`claude-mem` is an optional episodic-memory aid for Claude Code, not durable project authority. Enable it only after reviewing provider/retention/privacy choices, and never store secrets or sensitive customer data there. Revalidate recalled facts against current source.

Obsidian skills are optional when a project/team actually maintains a vault. Treat the vault as a knowledge interface; stable engineering decisions still belong in Git-tracked source, ADRs, Project Memory or Current Handoff.

If adopting a memory plugin/service, document:
- data stored,
- retention,
- privacy boundary,
- freshness/invalidation,
- export/portability,
- fallback when unavailable.
