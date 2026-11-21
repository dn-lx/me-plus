# Multi-agent Codespace

A minimal GitHub Codespace for **three independent coding agents**, each with its own account and conversation:

| Agent | Command | Account |
| --- | --- | --- |
| Claude Code | `claude` | Anthropic |
| OpenAI Codex CLI | `codex` | ChatGPT / OpenAI |
| Google Antigravity CLI | `agy` | Google |

There is **no orchestrator** or pooled subscription quota. Run one agent per terminal or switch whenever you want.

## Existing Codespace

- **Repository:** `dn-lx/multi-agent-codespace`
- **Codespace display name:** `multi-agent-codespace`
- **Workspace folder:** `/workspaces/multi-agent-codespace`
- **Integration branch:** `dev`
- **Technical Codespace hostname:** `cuddly-couscous-jj6wgvgvrg63q96p` (unchanged)
- **Remote container user:** `node`

Open [GitHub Codespaces](https://github.com/codespaces), select **multi-agent-codespace**, and choose **File → Open Folder** if needed to open `/workspaces/multi-agent-codespace`. Do not create a second Codespace.

The Codespace was rebuilt with the minimal container on 21 November 2026. Its Git checkout is the seven-file `dev` branch. The startup script installs the three CLIs into `~/.local/bin` and checks their versions. Provider sign-ins must be completed individually; the rebuild does **not** transfer previous login sessions.

### Start using the agents

Open a separate browser terminal tab for each:

```bash
cd /workspaces/multi-agent-codespace
claude
```

```bash
cd /workspaces/multi-agent-codespace
codex
```

```bash
cd /workspaces/multi-agent-codespace
agy
```

For device-based Codex login where available:

```bash
codex login --device-auth
```

Follow the official prompts for Claude and Google. Antigravity on headless Linux may need D-Bus/keyring troubleshooting. The container includes those prerequisites, but each provider's sign-in must still be tested.

### Diagnostics

```bash
cd /workspaces/multi-agent-codespace
bash scripts/doctor.sh
```

This only checks executable visibility, versions and Git environment. It doesn't read or expose credentials.

### Remote access

An authorized Windows computer can use `gh codespace ssh -c cuddly-couscous-jj6wgvgvrg63q96p` to manage the Codespace. If Windows is offline, the Codespace can also be accessed directly through GitHub's browser editor. Remote Desktop Commander inside Linux would require a separate installation and device pairing.

### Historical project preservation

The old Me+ checkout, including its unfinished files, was preserved at `/workspaces/_legacy-me-plus-preserved-20261121`. The source history also remains in the `prod` branch and `archive/me-plus-dev-before-cleanup-20261121`. **Do not delete this preservation folder until you've backed up or reviewed the unfinished files.**

The old `/workspaces/me-plus` path is only a compatibility symlink to the renamed clean workspace, retained so existing editor sessions don't break. Use `/workspaces/multi-agent-codespace` going forward.

### Constraints

- Codespaces suspends after inactivity and may have compute/storage charges beyond your GitHub allowance.
- CLI subscriptions and their rate limits are separate; API-based access may be billed separately.
- Each modifying agent should work on its own branch or worktree; don't run simultaneous editors against the same dirty worktree.
- No merging into production, secret sharing, or destructive cleanup of preserved work without express approval.
- Keep this repository limited to agent setup; clone actual apps into their own workspaces.

References: [Claude Code](https://code.claude.com/docs/en/setup) · [Codex](https://github.com/openai/codex) · [Google Antigravity](https://antigravity.google/download) · [GitHub Codespaces](https://docs.github.com/en/codespaces).
