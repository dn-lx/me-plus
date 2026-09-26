---
name: memory-context
description: Minimize unnecessary model context while preserving durable engineering knowledge and freshness.
---

# Memory and Context Efficiency

Read `docs/MEMORY-CONTEXT-POLICY.md`.

## Retrieval before reasoning

Search/index results are navigation evidence, not automatically revision-correct evidence. If a search tool cannot scope to the active branch/SHA, use the hit to locate candidate paths and then fetch/read those files from the active ref or local checkout before reasoning from their contents.

Before asking an agent to inspect a broad repository:

1. read compact Project Memory + Current Handoff,
2. inspect current Git diff/status/history,
3. use exact search,
4. use Graphify for relationships/change impact,
5. open only relevant source/tests,
6. broaden only when evidence requires it.

## Task context packet

For broad work, build a small explicit packet before broadening:
- requirement/acceptance criteria,
- current diff or failing evidence,
- one selected skill/superpower,
- the smallest relevant source/tests,
- Project Memory/Handoff only when they add task-relevant facts.

When running locally, `node scripts/context-packet.mjs <files...>` reports an approximate packet size. Use `--check` only when the team wants a hard local guard. The default task budget is a warning/discipline aid, not permission to omit required evidence.

Prefer adding one newly justified file at a time over dumping a directory. Do not resend a file unchanged after it has already supplied the needed fact.

## Do not resend

Avoid repeatedly sending:
- whole repositories,
- dependency/generated folders,
- full previous agent transcripts,
- duplicated documentation,
- unchanged large files.

## Durable write-back

After a material task, preserve only what future work needs:
- root cause,
- architectural decision,
- important files,
- tests proving the outcome,
- PR/commit reference,
- remaining risk.

Do not make model-generated memory more authoritative than source/tests/ADRs.

## Retry guard

If automating agents:
- cap retries,
- detect repeated identical failures,
- escalate or stop instead of looping,
- use deterministic commands for tests/build/status instead of asking another model to infer them.

## Reviewer packet

Normally give an independent reviewer:
- original requirement,
- final diff,
- relevant source,
- project rules,
- deterministic check results.

Do not send the full implementer transcript unless uniquely necessary.
