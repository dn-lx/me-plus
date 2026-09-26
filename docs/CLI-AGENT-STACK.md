# Optional CLI Agent Stack

This starter can use a deliberately small set of complementary local coding hosts when a project benefits from them. The goal is stronger implementation and review, not collecting every available agent.

## Optional baseline

| Host | Use when its verified capabilities fit | Notes |
| --- | --- | --- |
| Claude Code | Local repository/terminal implementation, refactoring or review | Optional host; plugin/skill ecosystem may be useful |
| Codex CLI | Local implementation, debugging, review or isolated worker tasks | Optional host; follows the same repository contract |
| Gemini CLI | Local implementation, analysis, long-context synthesis or review | Optional host; use when its current context/tooling is advantageous |
| OpenCode | Provider-neutral local/session execution | Optional fallback when portability/provider choice is useful |

These are execution hosts, not permanent quality rankings. Route by current capability, repository/tool locality and measured project outcomes.

Do **not** add Aider, Goose, Qwen Code, Kiro or another coding-agent layer by default. Add another host only when a project records a concrete capability gap that the four hosts above cannot cover economically or reliably.

## Router pattern

Use one coordinator/router for a task. The coordinator owns decomposition, branch/worktree ownership, integration, deterministic checks and the final PR.

A capability-based multi-host pattern is:

```text
selected coordinator/router
  ├─ capable host A -> scoped implementation worker
  ├─ capable host B -> independent review/debug worker
  ├─ capable host C -> specialist/long-context worker when justified
  └─ optional host  -> fallback/session runner
                    ↓
              isolated worktrees
                    ↓
          deterministic verification
                    ↓
                 PR -> dev
```

Do not invoke every host for every task. One lead agent is the default. Parallel workers must have separable scopes or be read-only reviewers.

## Isolation contract

- Every modifying worker gets its own feature/fix/chore branch or Git worktree.
- Never let two agents edit the same dirty working tree.
- The router integrates changes and owns conflict resolution.
- Reviewers receive the requirement, final diff, relevant source and deterministic evidence rather than the implementer's full transcript.
- Production still follows the repository's explicit `dev -> prod` approval path.

## Claude Code efficiency profile

Claude Code gets a small, intentional enhancement set. Repository rules in `AGENTS.md` remain authoritative over every plugin. The starter does not auto-enable third-party Claude plugins. Install the options below only when their value and trust/privacy boundary have been reviewed for the project.

### Ponytail — default simplicity guard

Use Ponytail to suppress unnecessary abstractions and prefer reuse/native capabilities/minimal diffs after the real code path is understood.

Install in Claude Code:

```text
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

Recommended default: `/ponytail full`.

Ponytail must never be used to remove validation, security boundaries, data-loss protection, accessibility requirements or required tests.

### Superpowers — implementation methodology

Install the official Superpowers plugin:

```text
/plugin install superpowers@claude-plugins-official
```

Use its brainstorming, TDD, systematic debugging and subagent-development techniques **inside** the outcome workflow already selected by this repository.

Important distinction:
- `.agents/superpowers/` = this repository's compact outcome workflows such as finish-feature/full-qa.
- the Claude Superpowers plugin = reusable implementation methodology.

The external plugin does not replace the repository workflows or branch rules.

### Code Review — high-confidence PR review

Install Anthropic's verified Code Review plugin:

```text
/plugin install code-review@claude-plugins-official
```

Use `/code-review` for substantive PRs or high-risk changes. Prefer manual/on-demand review unless the project has a reason to pay for review on every push. `REVIEW.md` contains the shared review contract.

Code Review is an additional reviewer, not a substitute for tests, builds, lint/type checks, security checks or human production approval.

The three plugins above are optional Claude enhancements. Enable only the ones a project needs; do not auto-enable plugins without a concrete gap.

### Claude token/cost discipline

Ponytail is only the implementation-simplicity layer. Control Claude usage independently:

- search/symbol-locate before reading whole files; read the smallest relevant ranges first;
- do not spawn a subagent for simple repository search, one-file edits, straightforward tests or documentation edits;
- use subagents only for genuinely independent work that benefits from isolation or parallelism, and give each a bounded context packet rather than the parent transcript;
- prefer the smallest capable model class from `docs/EXECUTION-ROUTING-POLICY.md`; escalate when evidence shows the cheaper class is failing or risk requires stronger reasoning;
- compact/reset long sessions at stable milestones after durable state is written to source, Project Memory, Current Handoff, an ADR or the PR;
- do not repeatedly resend unchanged files, logs or requirements once the needed facts are established;
- use deterministic search, tests, lint/type checks and generated summaries instead of asking the model to rediscover stable facts;
- measure total cost-to-correct-completion, not token count in isolation. Rework and failed cheap-model attempts are part of the cost.

For recurring/broad work, use `scripts/context-packet.mjs` before expanding context. Keep permanent knowledge in repository artifacts and temporary exploration in the session.

### claude-mem — optional persistent episodic memory

Install only when cross-session recall is useful and the project's privacy boundary allows it:

```text
npx claude-mem install
```

or in Claude Code:

```text
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

Rules:
- repository source, tests, ADRs, Project Memory and Current Handoff remain authoritative;
- do not use claude-mem as the only copy of a decision;
- do not capture secrets, credentials or sensitive customer data;
- review the selected memory provider and retention before enabling it;
- prefer the most privacy-preserving provider/configuration that still meets the project's need;
- stale memories must be revalidated against current source.

### Obsidian skills — optional knowledge workspace

Use only for projects/teams that actually maintain an Obsidian vault. The recommended portable skill set is `kepano/obsidian-skills`, which follows the Agent Skills format and works across Claude Code, Codex and OpenCode.

Claude Code installation:

```text
/plugin marketplace add kepano/obsidian-skills
/plugin install obsidian@obsidian-skills
```

Keep vault paths and personal notes outside the repository unless explicitly intended. Obsidian is a knowledge interface, not a replacement for Git history, ADRs, Project Memory or Current Handoff.

## Existing capabilities we intentionally keep instead of adding more plugins

The starter already has:
- Context7/current API documentation guidance,
- Graphify/code-relationship guidance,
- implementation planning for non-trivial delivery,
- test engineering plus deterministic quality gates,
- rendered frontend verification,
- performance budgets and analytics contracts,
- security-boundary review,
- code hygiene/dependency maintenance,
- frontend design + Taste + Motion + accessibility/visual regression,
- repository-local Superpowers and execution routing.

Do not add a second plugin that duplicates these responsibilities without a measured gap.

## OpenCode portability

OpenCode V2 reads repository `AGENTS.md` directly. Keep universal rules there; do not duplicate them into a second OpenCode-specific policy file. Provider selection belongs in local/runtime configuration, not Git.

## Codex portability

Codex should consume the repository `AGENTS.md` and the same compact context/skills strategy. Agent Plugins may be used when they provide a concrete capability, but plugin marketplaces and trust decisions are machine/user configuration unless the plugin is intentionally repo-scoped.

## Verification

Run:

```bash
node scripts/agent-cli-doctor.mjs
node scripts/agent-cli-doctor.mjs --strict
```

The first command reports which curated hosts are installed. `--strict` fails when any curated host is missing and is intended for a workstation where the full four-host setup is expected; do not make CI require local coding-agent CLIs.

Then verify inside each installed host that:
- repository instructions resolve to `AGENTS.md`,
- the correct branch/worktree is active,
- required MCPs/connectors are actually authenticated,
- Claude plugins/skills are visible when Claude is used,
- no host has blanket permissions that bypass normal review.

## Maintenance policy

Third-party plugins can execute hooks or background helpers. Review their source/release notes before installation or major upgrades. Keep plugin upgrades separate from application feature work when practical, and rerun the starter validation after changing the agent stack.
