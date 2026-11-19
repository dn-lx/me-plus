# Terminal model orchestrator

The owner requested a Codespaces orchestrator with ChatGPT, Claude or Gemini as
the coordinating interface and Claude Code/Gemini CLI as local workers. Terminal
access is the selected integration; no hosted MCP service is required.

## Evidence and scope

`scripts/local-agent-router.mjs` already builds bounded, shell-free invocations.
`.agents/router-profile.example.json` maps capability classes to local agents or
the coordinator, but nothing consumes that profile. No pushed task branch/PR
existed on 19 November 2026. The previous Codespace may contain uncommitted work;
do not reset or overwrite it when applying this branch.

## Delivery

1. Add a host-neutral CLI consuming the existing packet/profile contracts.
2. Validate configuration before invocation. Preview by default; execute only
   with `--execute`. Keep coordinator assignments local to the calling interface.
3. Normalize provider JSON/error results; report process completion separately
   from acceptance. Never retry/fallback silently or run task-supplied checks
   as shell commands. One worker per invocation; coordinator owns sequencing.
4. Add credential-free examples, terminal setup and negative-path/process tests.
5. Run relevant tests, repository policy checks and a fresh security review.

## Boundaries and verification

Normal provider permissions stay enabled. The executable allowlist is enforced
by the router; prompt instructions are not an OS sandbox. Provider output and
local task files can be sensitive: no automatic transcript persistence. No new
dependencies, ports, schema, application UI, analytics or production deployment.
Existing router callers remain supported. Minor capability impact for the next
release; VERSION is unchanged until release preparation. Rollback removes the
new entry point and restores any router validation changes.

Codespace API access currently fails with HTTP 403; browser control cannot start.
Tests with fake provider processes can verify routing/error handling but cannot
prove live authentication or account entitlement. Final acceptance requires the
two authenticated provider calls in the actual Codespace.
