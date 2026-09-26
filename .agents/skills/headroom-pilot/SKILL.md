---
name: headroom-pilot
description: Pilot Headroom context compression only when measured agent context/tool output is a real bottleneck, and compare quality before wider adoption.
---

# Headroom Pilot

Headroom is an **optional context-efficiency tool**, not a code cleanup tool and not a default project dependency.

Use only when measurement shows that repetitive tool output, file reads, logs, database rows, RAG payloads or long context are materially consuming model context.

Read `docs/MEMORY-CONTEXT-POLICY.md` first.

## Do not use Headroom to

- remove dead code,
- replace Graphify/source inspection,
- replace Project Memory or Current Handoff,
- hide important security evidence,
- compress the only copy of critical requirements,
- make an unverified claim that token usage improved.

Use `.agents/skills/code-hygiene/SKILL.md` for dead-code cleanup.

## Pilot trigger

Consider a pilot when one or more are observed:

- repeated large file/tool payloads,
- long build/test logs repeatedly sent to agents,
- context windows filling during otherwise focused tasks,
- repeated repository re-reading,
- excessive latency or quota usage caused by context rather than reasoning,
- measurable duplicated boilerplate in tool results.

If ordinary targeted retrieval + Graphify + compact memory already keep context small, do not add Headroom.

## Current integration modes

Headroom currently supports MCP/on-demand compression and wrapper/proxy approaches for compatible agent hosts. Verify current upstream documentation before installing because commands/integration details can change.

Prefer the **least invasive mode** for the first pilot.

Typical MCP-only setup at the time this skill was written:

~~~bash
pip install "headroom-ai[mcp]"
headroom mcp install
~~~

For agent wrappers, current upstream documentation also exposes commands such as:

~~~bash
headroom wrap claude
headroom wrap codex
~~~

Do not commit machine-specific MCP configuration or credentials.

## Pilot method

Choose 5–10 representative tasks, including ordinary implementation, debugging, one large-context task, and one review task.

Record before/after:

| Metric | Baseline | Headroom |
| --- | ---: | ---: |
| input/context estimate | | |
| agent/tool calls | | |
| latency | | |
| first-pass test success | | |
| reviewer findings | | |
| repair rounds | | |
| task success | | |

Adopt more broadly only if context/usage improves **without materially increasing rework, missed details or review defects**.

## Safety boundaries

Do not compress away:
- security requirements,
- authorization rules,
- user acceptance criteria,
- migration constraints,
- failing test lines needed for diagnosis,
- exact API/schema contracts,
- irreversible operation details.

For high-risk work, original source/diff/tests remain the evidence of record.

## Privacy and retention

Before enabling a compression proxy/MCP in a real project:
- understand where compressed/original content is stored,
- confirm local/remote processing mode,
- confirm retention/TTL behavior,
- avoid including secrets or unnecessary sensitive data,
- document any external data boundary.

## Rollback

Headroom must be removable without changing project correctness.

If unavailable, agents fall back to targeted retrieval, Project Memory / Current Handoff, Graphify/source search, and normal provider context management.

## Status

Treat Headroom as **🧪 pilot** until project-specific measurements justify wider use.