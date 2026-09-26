# Execution Routing Policy

Execution routing has two independent axes:

1. **Agent/host assignment** — where the work runs and which tools/data it can access.
2. **Model assignment** — which reasoning/coding model class that agent uses.

Do not confuse a host with a model. Cursor, ChatGPT/Codex, Claude Code, Gemini CLI, Copilot, Cline/Roo and similar environments are execution hosts/agents. A host may expose one model or several.

## Routing flow

```text
request
  ↓
task/outcome routing
  ↓
agent/host assignment
  ↓
model-class assignment
  ↓
one lead agent by default
  ↓
selected Superpower + minimal skills/context
  ↓
deterministic checks
  ↓
independent reviewer only when risk justifies it
```

## Agent/host assignment

Choose the host based on concrete capabilities available **now**, not brand preference.

Typical capability dimensions:
- local repository/filesystem access,
- terminal/build environment,
- IDE editing,
- GitHub/PR/CI access,
- browser/computer use,
- connected apps/MCPs,
- mobile/device tooling,
- database/hosting access,
- safe isolated worktrees/branches,
- ability to create a genuinely independent review session.

Prefer the current host when it can complete the task safely. Moving work to another agent has a context-transfer cost, so delegation needs a concrete benefit.

## Model-class assignment

Use stable classes rather than hard-coding provider winners:

| Model class | Use for |
| --- | --- |
| reasoning-high | architecture, hard debugging, security, ambiguous cross-system decisions |
| coding-high | substantial implementation and refactoring |
| fast-utility | mechanical edits, straightforward docs, summaries, deterministic follow-up |
| long-context | large repository/document synthesis after targeted retrieval is insufficient |
| multimodal | screenshots, visual evidence, image-heavy UI work |

Projects may map these classes to concrete model IDs in a routing profile. Mappings are runtime configuration and may change without altering project rules.

## Single-agent mode

When only one agent/host is available, such as a single ChatGPT/Codex session:

- keep one lead agent,
- use the best available model/class in that host,
- perform roles sequentially,
- use deterministic tooling instead of spawning artificial reviewers,
- use a fresh review pass/session only when the host supports it and risk justifies it.

The absence of multiple agents is not a defect.

## Multi-agent mode

Multiple agents are useful when work can be partitioned cleanly.

Good parallel candidates:
- independent research vs implementation,
- separate non-overlapping modules,
- implementation vs read-only security/review,
- UI verification vs backend implementation,
- independent test creation for a stable interface.

Poor parallel candidates:
- two agents editing the same files,
- three agents reading the whole repository to answer the same question,
- duplicate implementation attempts without a specific comparison objective,
- multiple reviewers for low-risk changes.

One coordinator owns:
- task decomposition,
- context packets,
- branch/worktree ownership,
- integration,
- final deterministic checks,
- handoff.

## Context packets

A delegated agent should receive only:
- scoped requirement,
- relevant project rules,
- affected files/interfaces,
- deterministic evidence or failing output,
- expected deliverable.

Do not pass full chat histories or another agent's hidden reasoning.

## Provider-neutral host rule

Do not assign permanent coordinator/implementer/reviewer roles by vendor name. A host may be excellent for one task and unsuitable for the next because repository state, browser access, connected apps, local tooling or model availability changed.

Provider-specific examples belong in optional host setup documentation. Runtime routing must use the capability dimensions above and measured project outcomes.

## Local execution bridge

When the coordinator needs local Claude Code or Gemini CLI execution, use `scripts/local-agent-router.mjs` and the contract in `docs/LOCAL-AGENT-ROUTER.md`.

The local bridge is intentionally narrow:
- it may invoke only `claude` or `gemini`,
- it must receive a scoped task packet,
- it is not a general shell,
- it must not be used for GitHub repository operations.

Use native integrations first. GitHub reads, branches, commits, pull requests, reviews, CI inspection and merges stay on the GitHub connector/API path whenever available. Do not tunnel GitHub work through the local router or an agent CLI merely because it is technically possible.

## Curated CLI baseline

The optional multi-host compatibility baseline is intentionally limited to Claude Code, Codex CLI, Gemini CLI and OpenCode. This is a portability/support list, not a role assignment or quality ranking. One coordinator owns integration, and one lead worker is the default. Do not invoke all four by default.

Do not add Aider, Goose, Qwen Code, Kiro or another coding-agent host unless the project records a specific capability gap not already covered by this baseline. See `docs/CLI-AGENT-STACK.md`.

## Token/cost controls

Apply these controls before adding more agent infrastructure:

1. **Retrieve before loading** — locate symbols/files first; broaden context only when targeted evidence is insufficient.
2. **One lead by default** — do not create a subagent for search, a one-file change, routine tests or docs. Delegate only separable work with a concrete expected benefit.
3. **Bound delegated context** — send requirements, interfaces, relevant source/diff and evidence; never copy the parent transcript by default.
4. **Smallest capable model** — start with the lowest-cost class that reliably fits the risk/complexity. Escalate after a concrete failure signal or when the task inherently requires stronger reasoning.
5. **Milestone compaction** — after a stable milestone, persist durable facts and continue from a compact handoff instead of carrying exploratory history indefinitely.
6. **No duplicate evidence** — avoid re-reading/resending unchanged files, giant logs, generated artifacts or lockfiles unless they are directly needed.
7. **Deterministic work stays deterministic** — prefer search, tests, linters, typecheckers and scripts over model reasoning for facts those tools can establish.

Token savings never justify omitting evidence required for correctness, security, accessibility, data integrity or production safety.

## Measurement

Track routing quality with:
- first-pass success,
- deterministic check success,
- repair rounds,
- review findings,
- input/output/cache token counts when the host exposes them,
- estimated or billed cost when available,
- tool calls and delegated/subagent count,
- context/usage estimate,
- latency,
- handoff/integration failures.

Optimize **cost to correct completion**, not raw token count. A cheap route that causes repeated retries can cost more overall. Compare task classes over enough samples before changing defaults; do not claim savings without measured evidence.

See:
- `.agents/skills/execution-routing/SKILL.md`
- `docs/AGENT-ORCHESTRATION.md`
- `docs/LOCAL-AGENT-ROUTER.md`
- `docs/MEMORY-CONTEXT-POLICY.md`
