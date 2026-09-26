# Current Handoff

**Last updated:** 2026-09-25

This file is the compact recovery record for unfinished work. GitHub/source/tests remain authoritative when they disagree with this handoff.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": null,
  "repository": null,
  "base": "dev",
  "branch": null,
  "pr": null,
  "status": "idle",
  "last_verified_sha": null,
  "next_step": null,
  "updated_at": "2026-09-24T22:46:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Current state

No active task is recorded in the starter template.

When non-trivial work begins:
- create/reconcile the focused branch from current `dev`,
- create a draft PR early,
- replace the idle task-state block with the active task/branch/PR binding,
- record only the compact verified next step needed after interruption.

## Recovery rule

Do not resume an arbitrary open branch. Apply `.agents/skills/task-continuity/SKILL.md`, inspect the referenced PR/branch/checks, compare with current `dev`, and continue only when the evidence matches the requested task.

## Production path

Production promotion is `dev → prod` with explicit human production approval.
