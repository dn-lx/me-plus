# Superpowers

Superpowers are compact end-to-end workflows. They orchestrate existing skills; they do not duplicate specialist instructions.

## Selection rule

Choose at most one primary superpower for a task. Load additional skills only when the selected workflow or task risk requires them. Do not preload the full superpower or skill catalog.

| Intent | Superpower |
| --- | --- |
| Continue interrupted/stalled work | `resume-project` |
| Deliver a normal feature/fix completely | `finish-feature` |
| Repair a failing build/CI loop | `fix-until-green` |
| Stabilize/recover degraded production | `recover-production` |
| Perform broad evidence-based verification | `full-qa` |
| Prepare/promote dev to production | `ship-release` |
| Audit project health and agent readiness | `project-doctor` |

Skills remain atomic capabilities. Superpowers sequence them around an outcome.

## Context contract

A superpower should receive only:
- the user requirement,
- the implementation plan when one exists,
- Project Memory and Current Handoff,
- current Git/PR/check state,
- the smallest relevant source/test set.

Each superpower names conditional skills to load. If a skill is not needed, do not read it.

Do not turn superpowers into long policy documents. Cross-project rules stay in `AGENTS.md`; specialist procedures stay in skills.
