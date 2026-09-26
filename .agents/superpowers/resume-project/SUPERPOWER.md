---
name: resume-project
description: Recover the trustworthy state of interrupted or stalled work and continue from the next safe step.
---

# Resume Project

1. Read `AGENTS.md`, Project Memory and Current Handoff.
2. Load `task-continuity` and validate the machine-readable task state.
3. Inspect the referenced/open PRs, current branch, working tree, recent commits, open PRs and relevant check/build status.
4. Verify whether the task/branch/PR binding and handoff are still true; source/Git/checks override stale notes.
5. Build a minimal working set: changed files, failing evidence, relevant tests and one applicable skill.
6. State the recovered outcome, completed work, blocker and exact next safe step.
7. Continue only from verified state. Never select a branch merely because it is open. Do not redo completed external writes or repeat an identical failed repair.

Load conditionally:
- `task-continuity` for branch/PR recovery (required).
- `memory-context` when context is broad or stale.
- `quality-gates` when implementation resumes.
- `security-boundary-review` only when the recovered task crosses a sensitive boundary.

Before ending unfinished work, refresh Current Handoff with evidence and the next safe step.
