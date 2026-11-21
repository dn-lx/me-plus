#!/usr/bin/env bash
# Install official coding agent CLIs independently; authentication is always interactive.
set -Eeuo pipefail

mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
if ! grep -Fqx 'export PATH="$HOME/.local/bin:$PATH"' "$HOME/.bashrc" 2>/dev/null; then
  printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.bashrc"
fi

failed=()
echo "Installing Codex CLI..."
if ! npm install --global --prefix "$HOME/.local" @openai/codex; then failed+=("codex"); fi

echo "Installing Claude Code CLI..."
if ! (curl -fsSL https://claude.ai/install.sh | bash); then failed+=("claude"); fi

echo "Installing Antigravity CLI..."
if ! (curl -fsSL https://antigravity.google/cli/install.sh | bash); then failed+=("agy"); fi

echo "Checking installed versions..."
for agent in claude codex agy; do
  if command -v "$agent" >/dev/null 2>&1; then
    "$agent" --version || true
  else
    echo "NOT FOUND: $agent"
    failed+=("$agent not found")
  fi
done

if (( ${#failed[@]} )); then
  printf 'Review installation errors for: %s\n' "${failed[*]}" >&2
  exit 1
fi

echo "All three CLIs installed. Sign in separately from the Codespaces terminals."
echo "Subscription entitlements and Google keyring access still require interactive validation."
