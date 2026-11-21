# Multi-agent Codespace

One lightweight GitHub Codespace with **three independently usable coding agents**:

| Agent | Terminal command | Sign in with |
| --- | --- | --- |
| Anthropic Claude Code | `claude` | Your eligible Claude account |
| OpenAI Codex CLI | `codex` | Your eligible ChatGPT account |
| Google Antigravity CLI | `agy` | Your eligible Google account |

**No central orchestrator is installed.** Choose any agent at any time. All three can read the same repository files but their chats, entitlements and rate limits remain separate. This repository is an environment; clone your actual applications into separate working directories or Codespaces.

## Use your existing Codespace

Open [GitHub Codespaces](https://github.com/codespaces) and enter the existing Codespace. Do **not** create a second Codespace just to switch agent.

For the **currently running Codespace**, the three CLIs were installed separately in `/home/codespace/.local/bin` on 21 November 2026, but subscription sign-ins were still pending. Until its configuration is rebuilt, you can continue to use its current Linux home and terminal.

**Important — preserve outstanding work first:** At the time of inspection, the running Codespace had uncommitted files on `feature/model-orchestrator`. Do not delete, reset or change that worktree to apply this cleanup. First commit/push the work to an appropriate branch or otherwise back it up. Repository cleanup happens on a separate GitHub branch.

After the cleanup is approved and integrated, use **Codespaces: Rebuild Container** to adopt this minimalist devcontainer. Rebuilding changes the remote user to `node`, and may require you to sign in again. It reinstalls the CLIs automatically but does **not** import personal credentials.

## Access from iPad or laptop

Open the Codespace in Safari, Chrome, or VS Code and select any of three separate terminals:

```bash
# Terminal 1
claude

# Terminal 2
codex

# Terminal 3
agy
```

To authenticate Codex using a device authorization where supported:

```bash
codex login --device-auth
```

Complete Claude and Google sign-ins through their official prompts. A headless Codespace may require troubleshooting Google D-Bus/keyring and browser OAuth. The devcontainer adds Linux Secret Service prerequisites, but **successful login is not guaranteed**. No API keys are required for ordinary subscription-backed CLI sign-ins; API-based usage is separately billed.

When connected remotely, `gh codespace ssh` can reach a running Codespace from an authorized host. An interactive CLI session does not automatically appear in a provider's separate mobile/web app; where supported, session remote control must be configured individually.

## Diagnostics

```bash
bash scripts/doctor.sh
```

Read-only check of versions and command visibility. For each agent, run an additional harmless read-only task after signing in.

## Costs and limitations

GitHub Codespaces compute and storage usage may incur charges beyond your account allowance; Codespaces automatically suspends after inactivity. Each AI provider enforces its own plan limits. This configuration does not pool subscriptions, track usage across providers, or allow the agents to talk to each other automatically.

## Repository scope and safeguards

Do not add Me+ web/mobile apps, Supabase migrations, generated artifacts, or unrelated project source to this environment repository. Keep actual product repositories distinct.

The original Me+ source is preserved on the historical `prod` branch and on `archive/me-plus-dev-before-cleanup-20261121`. The old `feature/model-orchestrator` work must be preserved before altering the active Codespace working tree.

Official references: [Claude Code](https://code.claude.com/docs/en/setup) · [Codex CLI](https://github.com/openai/codex) · [Antigravity](https://antigravity.google/download) · [Codespaces](https://docs.github.com/en/codespaces).
