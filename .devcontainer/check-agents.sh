#!/usr/bin/env bash
# Read-only installation diagnostics. Never prints account credentials.
set -u
export PATH="$HOME/.local/bin:$PATH"
echo "Me+ GitHub Codespaces independent coding agents"
echo "Current repository: $(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")"
echo "Current branch: $(git branch --show-current 2>/dev/null || echo unknown)"
for cmd in node npm git python3 tmux claude codex agy; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf '%-10s' "$cmd"
    "$cmd" --version 2>&1 | head -n 1 || true
  else
    printf '%-10s NOT FOUND\n' "$cmd"
  fi
done
echo "Login status is not tested. Run the CLIs interactively and verify each provider plan."
