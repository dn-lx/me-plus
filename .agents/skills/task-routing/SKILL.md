---
name: task-routing
description: Select the smallest applicable superpower and skill set for a coding task without preloading the whole agent stack.
---

# Task Routing

Use this skill when the request is broad, ambiguous, stalled, or naturally end-to-end.

1. Classify the primary outcome: resume, deliver, repair CI/build, recover production, verify, release or audit.
2. Select exactly one primary workflow from `.agents/superpowers/README.md`.
3. Read that superpower file.
4. If multiple agent hosts or model choices are available, read `.agents/skills/execution-routing/SKILL.md` and assign the smallest capable execution setup.
5. If the task is a focused visual defect (contrast/alignment/overflow/clipping/responsive), route directly to `frontend-verification`; do not load the full design stack unless visual direction changes.
6. Load only skills explicitly required by the workflow or by detected risk.
7. If the direct skill is not obvious, consult `.agents/SKILL-INDEX.md`; do not preload it at session start.
8. Keep platform/MCP/setup documents unloaded unless the task actually depends on them.
9. If no superpower fits, use the smallest directly relevant skill instead.

Do not chain multiple superpowers merely because they exist. A selected superpower may invoke deterministic checks and specialist skills as needed.
