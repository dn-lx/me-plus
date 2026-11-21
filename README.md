# Multi-agent Codespace

A lightweight GitHub Codespace hosting **three independent official coding agents**. Each has its own login, conversations, plan limits, and coding workspace; there is **no master agent, automatic orchestration, or pooled subscription quota**.

| Tool | Command | Provider |
|---|---|---|
| Claude Code | `claude` | Anthropic |
| Codex CLI | `codex` | OpenAI |
| Antigravity CLI | `agy` | Google |

## Open the existing Codespace

Open [GitHub Codespaces](https://github.com/codespaces) and select the Codespace with display name **multi-agent-codespace**.

- Repository: `dn-lx/multi-agent-codespace`
- Working folder: `/workspaces/multi-agent-codespace`
- Integration branch: `dev`
- Official agents are installed by `.devcontainer/install-agents.sh`
- Default environment: Node.js 22, Git, GitHub CLI, ripgrep, Python, tmux, and Linux keyring/D-Bus components

This repository intentionally contains **environment tooling only**, not Me+ app code.

### Step 1 — Check installations and login status

```bash
cd /workspaces/multi-agent-codespace
bash scripts/doctor.sh
bash scripts/doctor.sh --auth
bash tests/smoke.sh  # local regression check, also run in GitHub Actions
```

Sign in interactively, **separately**, when required:

```bash
claude
codex login --device-auth
agy

# GitHub CLI uses its own authorization
# (needed for GitHub PR commands inside this Codespace)
gh auth login -h github.com
```

Use the providers' own login flows. The installer does not accept or commit passwords, keys or tokens. Subscription access depends on provider eligibility. API-based usage may incur separate charges.

### Step 2 — Set up a real project with isolated Git branches

```bash
bash scripts/project.sh add https://github.com/OWNER/REPOSITORY.git my-project
bash scripts/project.sh status my-project
```

This creates:

```text
/workspaces/projects/my-project/
  source/     # clean reference clone; do not edit here
  claude/     # branch agents/claude/...
  codex/      # branch agents/codex/...
  agy/        # branch agents/agy/...
```

If the target repository contains a `dev` branch, that is the starting point. Otherwise the remote default branch is the start point. The script **never modifies or merges a protected branch**. It creates new agent branches and does not deploy.

The worktrees are created only when you request a project. You may use any app repository, including private ones when Git is appropriately authorized.

### Step 3 — Start three independent coding sessions

Use three browser terminal tabs:

```bash
# Tab 1
bash scripts/agent.sh claude my-project

# Tab 2
bash scripts/agent.sh codex my-project

# Tab 3
bash scripts/agent.sh agy my-project
```

Each launcher uses a separate Git worktree and a separate **tmux** session. To detach without stopping the agent, press **Ctrl-b**, then **d**. Re-run the same launcher to reconnect. `bash scripts/agent.sh status` lists sessions.

For maintenance of this environment itself, omit the project name: `bash scripts/agent.sh codex`.

**tmux survives browser-terminal disconnects; it does not survive a stopped or rebuilt Codespace.** Never let agents modify the same dirty worktree.

### Step 4 — Review handoffs and integrate safely

Have each agent implement or review in its own worktree. Once tested, the owner can open a pull request from an agent branch and choose what to merge. Do not ask one agent to edit another agent's uncommitted working directory. Use project instructions (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) if supplied by that repository.

### Direct ChatGPT access

The paired Linux Desktop Commander remote device allows ChatGPT terminal and file access directly, without your Windows PC.

```bash
bash scripts/remote.sh status
bash scripts/remote.sh start
bash scripts/remote.sh attach
```

The `status` command checks whether the remote process is running, **not** whether the device has completed pairing. Pairing may need repeating after a container rebuild.

Codespaces `postStartCommand` requests that Desktop Commander reconnect in a detached tmux session when the Codespace starts. If its prior device pairing is unavailable, use `attach` and follow the official pairing instructions. Credentials remain in the user's private home folder, never this Git repository. No automatic permission bypass is enabled.

The `--disable-no-sleep` flag allows Codespaces to suspend normally. This means ChatGPT access disappears when the Codespace is stopped or suspended and returns only once it is running and the remote agent reconnects. **Codespaces compute/storage may be billable.**

### Historical data

The old Me+ checkout and its uncommitted files were saved at `/workspaces/_legacy-me-plus-preserved-20261121`. The old `prod` branch and archive branch also retain the tracked source. Do not delete the preservation folder until you've exported its unfinished files. The old `/workspaces/me-plus` link exists only for older editor sessions.

### Updating or rebuilding

The committed `.devcontainer` defines reproducible installations. Rebuilding may remove CLI login sessions and restart remote pairing. Do not rebuild during active agent sessions. After rebuilding, run `bash scripts/doctor.sh --auth` and recheck the remote agent.

## References

[Claude Code](https://code.claude.com/docs/en/setup) · [Codex CLI](https://github.com/openai/codex) · [Antigravity CLI](https://antigravity.google/docs/cli) · [GitHub Codespaces](https://docs.github.com/en/codespaces) · [Desktop Commander](https://desktopcommander.app/help/getting-started/what-is-desktop-commander)
