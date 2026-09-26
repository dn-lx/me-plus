# Task and Branch Lifecycle

This document defines how coding work survives chat interruption, model switching and agent handoff.

## Principle

Conversation memory is not task state. GitHub is the engineering record; Current Handoff is the compact recovery record.

The normal identity chain is:

```text
task / requirement
      ↓
repository
      ↓
working branch
      ↓
draft/open PR
      ↓
verified next step
```

An open branch by itself is never enough evidence to resume work.

## Task states

Supported states:

- `idle`
- `planning`
- `implementing`
- `testing`
- `reviewing`
- `blocked`
- `interrupted`
- `ready_to_merge`
- `merged`
- `cancelled`

For non-trivial implementation work, create a draft PR early. From `implementing` onward, the task should normally have a PR number.

## Machine-readable Current Handoff block

Keep exactly one block in `docs/CURRENT-HANDOFF.md`:

```text
<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "REQ-123",
  "repository": "owner/repository",
  "base": "dev",
  "branch": "feature/example",
  "pr": 42,
  "status": "implementing",
  "last_verified_sha": "0123456789abcdef0123456789abcdef01234567",
  "next_step": "Run the targeted integration test after the API fix.",
  "updated_at": "2026-09-24T00:00:00Z"
}
<!-- AGENT_TASK_STATE_END -->
```

Use `null` for task-specific fields when status is `idle`.

Run:

```bash
node scripts/task-state.mjs --check
```

to validate the block.

## Recovery algorithm

When a new session receives "continue", "resume", "fix it", or another request that may refer to existing work:

1. read `AGENTS.md`, Project Memory and Current Handoff,
2. inspect the machine-readable task state,
3. inspect the referenced GitHub PR/branch and current `dev`,
4. prefer GitHub/source/check evidence over stale handoff or chat memory,
5. continue only if task, branch and PR still correspond to the requested outcome,
6. otherwise mark the old state stale/superseded and bind the task explicitly.

If several open branches exist, do not choose one merely because it is open.

## Draft PR policy

Create a draft PR early for non-trivial implementation so GitHub preserves:
- the branch association,
- task title/description,
- changed files,
- review discussion,
- CI/check history,
- durable URL/PR number.

The PR template contains a task-continuity section. Keep it current enough that another agent can identify the task without reading a long transcript.

## Parallel agents

Default: one writer per task branch.

Reviewers may work in parallel without write ownership. If two implementers are needed, give them separate branches/worktrees and integrate through explicit commits/PRs.

A future AI Control Plane may add expiring write leases. A lease coordinates writers; it never overrides repository truth.

## Completion and cleanup

When implementation is otherwise ready for final verification:
1. reset the branch's `AGENT_TASK_STATE` block to the idle template state,
2. make that reset part of the final merge-candidate revision,
3. run/retrigger required checks for that exact head SHA,
4. merge only if the current head is green/verified.

This ordering avoids a handoff-only commit invalidating an already-finished verification run. If a later repair/change is required, restore an active task state before continuing and treat the previous green checks as stale.

The PR body/history remains the durable per-task record; `dev` must not inherit a stale active-task marker.

After a PR merges into `dev`:
- verify the merged SHA/check state,
- let GitHub's native "Automatically delete head branches" remove the temporary branch,
- keep `dev` and `prod` protected and permanent,
- do not reuse completed temporary branch names,
- retire stale/unmerged branches only after reviewing whether they contain unique work.

Production promotion is only `dev → prod` with explicit production approval.
