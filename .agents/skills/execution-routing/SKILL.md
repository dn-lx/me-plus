---
name: execution-routing
description: Assign work across available agent hosts and model classes with the minimum parallelism and context needed for reliable delivery.
---

# Execution Routing

Use after task routing when more than one agent/host or model choice is available, or when the current host must decide whether to delegate.

## 1. Agent assignment

Choose the execution environment before choosing the model.

Prefer the current agent when it already has the required repository, terminal, browser, connector and write capabilities. Delegate only when another agent has a material capability advantage or when independent review is required.

Examples of agent/host capabilities:
- repository + PR/CI orchestration,
- IDE-local editing and terminal access,
- browser/computer interaction,
- connected business systems,
- mobile/build environment,
- independent review environment.

Do not create another agent merely to duplicate the same context.

## 2. Model assignment

Within the selected agent, choose the smallest capable model class for the role:

- `reasoning-high` — architecture, difficult debugging, security, ambiguous cross-system work.
- `coding-high` — substantial implementation/refactoring.
- `fast-utility` — mechanical edits, summaries, formatting, simple deterministic follow-up.
- `long-context` — repository/document-scale synthesis when targeted retrieval is insufficient.
- `multimodal` — screenshots, visual UI evidence, diagrams or image-heavy inputs.

Actual provider/model IDs belong in the runtime/project routing profile, not this skill.

## 3. Parallelism decision

Default to one lead agent.

Use multiple agents only when:
- tasks are genuinely separable,
- they can work on isolated branches/worktrees or read-only review packets,
- duplicated context cost is lower than the expected time/quality gain,
- one coordinator owns integration.

Never let multiple agents modify the same dirty working tree.

## 4. Review independence

For high-risk work, use a capable reviewer independent of the implementation pass when practical. Give the reviewer the requirement, final diff, relevant files and deterministic evidence — not the implementer's full transcript.

## 5. Single-agent fallback

If only one agent is available, keep the same workflow but collapse roles sequentially:
plan → implement → deterministic checks → fresh review pass when justified.

Do not fail merely because preferred agents/models are unavailable if the current environment can safely perform the work.

## 6. Curated host baseline

When multiple CLI hosts are available, the default supported set is Claude Code, Codex CLI, Gemini CLI and OpenCode. Their suggested responsibilities and setup live in `docs/CLI-AGENT-STACK.md`. Treat those roles as defaults, not rankings, and do not use every host on every task.

Do not introduce another coding-agent host unless the project documents a concrete capability gap.

## 7. Usage discipline

Optimize in this order:
1. required capability and correctness,
2. required tool/data locality,
3. smallest useful context,
4. minimum number of agents,
5. model cost/latency among comparably capable choices.

Record only material routing decisions in Current Handoff when another agent needs them.
