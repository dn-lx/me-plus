---
name: mcp-usage
description: Safely discover, verify and use MCP servers, plugins, connectors or equivalent external capabilities without coupling the project to one agent host.
---

# MCP / Connector Usage

Read `docs/MCP-SETUP.md` first.

## Before use

1. Identify the capability needed.
2. Check the Project MCP profile.
3. Discover/list the actual connection in the current host.
4. Perform a harmless read.
5. Verify account/project/environment.
6. Confirm permission level.
7. Only then perform the minimum authorized write.

## Write safety

For database, hosting, payment, email, analytics, storage, repository settings or other shared external systems:
- treat them as live/shared unless proven isolated,
- prefer reversible operations,
- describe destructive/irreversible effects before execution,
- preserve least privilege,
- record material writes in Current Handoff,
- before retrying a failed write, reconcile the remote state first so an already-completed action is not repeated,
- use provider idempotency keys/request IDs when available,
- keep automatic retries bounded and stop on repeated identical failures.

## Secrets

Never put tokens, API keys, passwords, private certificates or OAuth refresh tokens in:
- source,
- docs,
- prompts,
- screenshots,
- logs,
- PR bodies,
- generated artifacts.

## Failure mode

If an MCP is missing or cannot be verified:
- do not pretend it is connected,
- do not silently substitute an unrelated write path,
- report the missing capability,
- use a safe non-destructive alternative only when it still satisfies the task.

## New integrations

Use the “Adding a new MCP/connector” checklist in `docs/MCP-SETUP.md` before expanding permissions or connector count.
