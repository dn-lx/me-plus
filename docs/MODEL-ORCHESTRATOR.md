# Terminal model orchestrator

ChatGPT, Claude or Gemini can be the coordinator when the interface has terminal
access to this checkout. They all use the same command and JSON contract. The
interface name is provenance; it neither logs into a provider nor transfers a
chat subscription, connector, tools or permissions into the Codespace.

## Codespaces setup

Open the Codespace bound to `dn-lx/me-plus`. Inspect `git status --short --branch`
first and preserve any existing uncommitted orchestrator work. This implementation
is on `feature/model-orchestrator` (PR #91 into `dev`). Use that branch only after
saving/reconciling local changes. Run commands from the repository root using
Node >=22.13.0. No dependency install or public port is needed for the router.

Install Claude Code and Gemini CLI using their official instructions and sign in
**inside the Codespace**:

- [Claude Code setup](https://code.claude.com/docs/en/setup)
- [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/)

Check `claude --version` and `gemini --version`, then complete each CLI's normal
interactive sign-in/trust flow. Installation/version checks do not prove login.
Keep credentials private and normal tool permissions enabled. Never add blanket
permission bypasses. Provider account entitlement must support the installed CLI.

## Preview and run

The committed example requests a harmless final answer without tools or edits.
Preview the exact invocation first (no provider process or API call):

```bash
node scripts/agent-orchestrator.mjs --interface chatgpt --task .agents/task-packet.example.json --class coding-high
```

Execute one scoped call for each worker to verify live authentication:

```bash
node scripts/agent-orchestrator.mjs --interface chatgpt --task .agents/task-packet.example.json --class coding-high --execute
node scripts/agent-orchestrator.mjs --interface chatgpt --task .agents/task-packet.example.json --class long-context --execute
```

Use `--interface claude` or `--interface gemini` for the other coordinating
interfaces. The worker choice comes from the capability class, independently of
the interface. Execution sends the packet to the selected provider and can incur
provider usage. Verify `status: worker_completed` and `ORCHESTRATOR_OK` in the
response; a zero process exit by itself does not prove the requested outcome.

## Routing and workflow

The default profile is `.agents/router-profile.example.json`. Pass a private
`--profile /path/profile.json` to customize mappings without changing executables
or relaxing policy. The profile supports only `claude`, `gemini`, and
`coordinator` assignments. No arbitrary command, model-generated route or silent
provider fallback is accepted.

| Class | Example route |
| --- | --- |
| coding-high | Claude Code |
| long-context | Gemini CLI |
| reasoning-high | Calling coordinator |
| fast-utility | Calling coordinator |

For real work create a private JSON packet following
[the existing packet contract](LOCAL-AGENT-ROUTER.md#task-packet). Do not put keys,
private records or unrelated context in the packet. `implement` defaults to
`coding-high`; `plan` and `review` default to `reasoning-high`. `--class` overrides
that choice explicitly. `--cwd /path/project` selects the worker's directory;
task/profile paths are resolved relative to the terminal's current directory.

The coordinator owns task decomposition, original requirements, branch/PR
ownership, checking diffs, deterministic verification and final acceptance.
Invoke one task at a time in a shared checkout. A typical sequence is: coordinator
plans; coding worker implements; coordinator runs checks; a fresh review packet
goes to the other provider; coordinator resolves findings and verifies acceptance.
The command does not automatically hand an implementation transcript to a
reviewer, run task-supplied checks as shell commands, retry failed writes, commit,
push, merge, or deploy. GitHub operations stay on the coordinator's native API.

## Results and limits

- Without `--execute`, the result is `preview`, including command, prompt and
  working directory. `--dry-run` is an explicit synonym for the default.
- `coordinator_required` means no subprocess was started. Handle the task in the
  interface that called the command.
- `worker_completed` means a nonempty successful provider response was returned.
  `acceptanceVerified` remains false: the coordinator must verify the work.
- Configuration, process, timeout, malformed JSON and provider-envelope errors
  exit nonzero. No retry or fallback occurs. Resolve login/tool compatibility or
  task failures, inspect partial edits, then decide whether to retry.
- The wrapper bounds wall time and captured output (4 MiB). Claude additionally
  receives `maxTurns`; Gemini uses the wall-time budget and its own configured
  turn limits. No blanket approval or sandbox bypass flags are supplied.
- `shell: false` and a fixed executable allowlist protect the invocation boundary.
  CLI tools can still edit/run commands under their own permissions. Prompt
  instructions are **not** a filesystem/network sandbox. Run only in a trusted,
  scoped workspace with appropriate provider/OS controls.
- Output may contain task context or provider diagnostics. No reports/transcripts
  are written automatically; keep any redirected output private. Preview includes
  the prompt. Provider subprocesses inherit the host environment and can discover
  host-configured tools, so configure least privilege in that host.

References checked 19 November 2026:
[Claude CLI reference](https://code.claude.com/docs/en/cli-reference),
[Gemini CLI reference](https://geminicli.com/docs/cli/cli-reference/),
[Gemini headless JSON](https://geminicli.com/docs/cli/headless/).
Verify installed versions when a flag or login method is unavailable.

## Deterministic verification

```bash
node --test tests/local-agent-router.test.mjs tests/agent-orchestrator.test.mjs
```

These tests use fake local provider processes. They verify routing, error handling
and command boundaries without credentials; they do not prove live provider
authentication. Live acceptance requires the two smoke calls above in Codespaces.
