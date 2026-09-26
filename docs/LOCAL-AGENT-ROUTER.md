# Local Agent Router

The local agent router is an optional execution bridge for delegating scoped work to Claude Code or Gemini CLI on a developer-controlled machine.

It is deliberately **not** a general remote shell.

## Boundary

The coordinator may use the local router only to invoke the allowlisted agent CLIs:

- `claude`
- `gemini`

The router itself does not expose arbitrary command execution and must not be used for GitHub operations. Repository reads, branches, commits, pull requests, reviews, CI inspection and merges belong on the native GitHub connector/API path whenever that capability is available.

The delegated agent is instructed not to commit, push, fetch, rebase, create or merge pull requests, run `gh`, or change branches. Its job is to work on the scoped local task and return implementation/review evidence to the coordinator.

## Task packet

A task packet is JSON with this shape:

```json
{
  "version": 1,
  "taskId": "auth-refresh-001",
  "mode": "implement",
  "outcome": "Add refresh-token recovery without changing the public API",
  "context": {
    "files": ["apps/mobile/src/auth/session.ts"],
    "notes": ["Preserve existing error semantics"]
  },
  "constraints": ["Do not perform GitHub operations"],
  "acceptanceCriteria": ["Expired sessions recover once", "Tests cover retry failure"],
  "checks": ["npm test -- auth"],
  "budget": {
    "maxTurns": 12,
    "timeoutMs": 900000
  }
}
```

`mode` is one of `plan`, `implement`, or `review`.

## Usage

Dry-run first to inspect the exact allowlisted invocation:

```bash
node scripts/local-agent-router.mjs --agent claude --task task.json --dry-run
node scripts/local-agent-router.mjs --agent gemini --task task.json --dry-run
```

Run the task locally:

```bash
node scripts/local-agent-router.mjs --agent claude --task task.json --cwd /path/to/project
```

The router invokes Claude Code in non-interactive print mode or Gemini CLI in non-interactive prompt mode. The CLIs remain responsible for their own authentication and local permission configuration.

## Routing profile

`.agents/router-profile.example.json` demonstrates how a project can map stable model classes to concrete local agents without hard-coding vendor choices into the general routing policy.

Treat the example mapping as a starting point, not a permanent ranking. Update project mappings from measured outcomes, current capabilities and cost.

## Native connector first

Use the narrowest native integration that already owns the resource:

- GitHub work → GitHub connector/API
- local Claude delegation → local router → Claude Code
- local Gemini delegation → local router → Gemini CLI

Do not tunnel GitHub work through the local router merely because a shell or agent could technically perform it. This keeps permissions smaller, audit trails clearer and token/compute use lower.

## Security notes

The router uses `spawnSync` with `shell: false` and chooses the executable from a fixed allowlist. A task packet cannot supply an arbitrary executable or shell command.

This boundary protects the coordinator-to-router interface. Claude Code and Gemini CLI are still powerful local agents, so their own tool permissions, sandboxing and filesystem access must also be configured appropriately for the project and machine.
