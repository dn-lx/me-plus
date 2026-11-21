# Me+ — Three independent agents in the *existing* GitHub Codespace

This repository's optional Codespaces configuration installs the official:
- **Anthropic Claude Code CLI**: `claude` (your own Claude login).
- **OpenAI Codex CLI**: `codex` (sign in with ChatGPT where supported).
- **Google Antigravity CLI**: `agy` (your own Google account, subject to plan and headless Linux login compatibility).

**None is the manager of another.** No cross-agent plugins, autonomous routing, shared account credentials, or metered APIs are configured. Each tool has its own chat/terminal session and provider limits. All are installed inside the same Codespace workspace.

## Applying to the existing Me+ Codespace

The Codespace already exists; **do not create a duplicate**. To apply the new configuration from the GitHub feature branch:

1. Open your existing Me+ Codespace: https://github.com/codespaces
2. Inspect/save any uncommitted changes before switching branches (`git status`). Do not discard active work.
3. In the terminal, after ensuring a clean or safely preserved working tree:

   ```bash
   git fetch origin chore/codespaces-independent-agents-20261121
   git switch --track origin/chore/codespaces-independent-agents-20261121
   ```

   If the branch already exists locally, use `git switch chore/codespaces-independent-agents-20261121` instead. If Git warns about local changes, **stop** and preserve them before switching.

4. From the Command Palette select **Codespaces: Rebuild Container**. Rebuilding runs `bash .devcontainer/install-agents.sh`. The first build downloads packages; do not enter credentials into any build logs. Codespaces may charge compute/storage beyond your allowance.
5. In the new terminal, verify installation without exposing tokens:

   ```bash
   bash .devcontainer/check-agents.sh
   ```

6. Open three independent terminal tabs (one for each) and authenticate interactively:

   ```bash
   # Claude Code
   claude

   # Codex — choose ChatGPT device sign-in when supported
   codex login --device-auth
   codex

   # Antigravity CLI
   agy
   ```

Do not enter API keys unless you deliberately choose separately metered API usage. Subscription availability and regional limitations must be confirmed during login. Keep account tokens/cookies outside Git.

## iPad access and separate agent interfaces

- **Reliable common interface:** Open the *existing* Codespace from Safari on your iPad and choose any of the three terminal tabs.
- **Claude app's Remote Control, Codex desktop/web app, and Antigravity's browser remote-control interface:** These are *different* remote-session products. A Codespaces terminal session does not automatically appear in those apps. Their remote attachment needs separate provider-specific setup, and availability must be tested, particularly in a headless Codespace.
- **Not a graphical Antigravity desktop:** This installs Antigravity **CLI** (`agy`), not the full Antigravity IDE.

## Antigravity Linux authentication limitation

Google Antigravity CLI may require a Linux Secret Service (D-Bus/keyring) session for consumer-account OAuth. The devcontainer adds relevant packages but cannot guarantee an unlocked secure keyring in a headless Codespace. If Google login fails, follow Google's official CLI authentication/troubleshooting instructions; do not disable secure storage, copy tokens into Git, or force a third-party credential wrapper.

## Keeping agents separate and repository safe

Me+ already has an `AGENTS.md` and `.agents/project-policy.json`. All three agents should read the same instructions, Project Memory and Current Handoff. Only one modifying agent may own a working tree at a time. To work in parallel, create separate Git worktrees and dedicated `feature/*`, `fix/*`, or `chore/*` branches for each agent. No agent should merge to `prod` without your explicit approval.

Codespaces may suspend when idle, which stops interactive agents. Changes committed and pushed to Git survive; in-memory sessions may not. Agent usage is controlled independently by each provider; no quota-sharing or billing router is installed.

## Verification — not assumed by a successful GitHub commit

- [ ] The existing Codespace checked out this configuration branch without data loss
- [ ] Codespace rebuild succeeded
- [ ] `claude --version` passed
- [ ] `codex --version` passed
- [ ] `agy --version` passed
- [ ] Claude signed in to the intended subscription
- [ ] Codex signed in to the intended ChatGPT subscription
- [ ] Antigravity signed in to the intended Google account
- [ ] Each agent completed a harmless read-only repository task
- [ ] Optional separate-app remote control was tested, if desired

## References

- GitHub: https://docs.github.com/en/codespaces/developing-in-a-codespace/rebuilding-the-container-in-a-codespace
- Claude Code: https://code.claude.com/docs/en/setup
- Codex: https://github.com/openai/codex
- Antigravity CLI: https://antigravity.google/docs/getting-started?tab=cli
