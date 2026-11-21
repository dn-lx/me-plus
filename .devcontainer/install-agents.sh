#!/usr/bin/env bash
# Official CLIs only. Separate interactive provider authentication is required.
set -Eeuo pipefail

mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
line='export PATH="$HOME/.local/bin:$PATH"'
if ! grep -Fqx "$line" "$HOME/.bashrc" 2>/dev/null; then
  printf '\n%s\n' "$line" >> "$HOME/.bashrc"
fi

failed=()
printf '\n[1/3] OpenAI Codex CLI\n'
if ! npm install --global --prefix "$HOME/.local" @openai/codex; then
  failed+=("codex")
fi

printf '\n[2/3] Claude Code CLI\n'
if ! (curl -fsSL https://claude.ai/install.sh | bash); then
  failed+=("claude")
fi

printf '\n[3/3] Antigravity CLI\n'
if ! (curl -fsSL https://antigravity.google/cli/install.sh | bash); then
  failed+=("agy")
fi

printf '\nInstalled versions:\n'
for bin in claude codex agy; do
  if command -v "$bin" >/dev/null 2>&1; then
    "$bin" --version || failed+=("$bin version")
  else
    printf 'NOT FOUND: %s\n' "$bin" >&2
    failed+=("$bin missing")
  fi
done

if (( ${#failed[@]} )); then
  printf 'Attention required: %s\n' "${failed[*]}" >&2
  exit 1
fi

printf '\nReady to sign in separately with: claude, codex, agy\n'
printf 'No accounts have been authenticated by this installer.\n'
