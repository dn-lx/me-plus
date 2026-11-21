#!/usr/bin/env bash
# Read-only preflight: versions and environment; never reads or prints credentials.
set -u
export PATH="$HOME/.local/bin:$PATH"
printf 'Workspace: %s\n' "$(pwd)"
printf 'Git branch: %s\n' "$(git branch --show-current 2>/dev/null || echo none)"
printf 'System: '
uname -sm
printf '\n'
for tool in git node npm python3 tmux claude codex agy; do
  printf '%-10s' "$tool"
  if command -v "$tool" >/dev/null 2>&1; then
    if [ "$tool" = "tmux" ]; then
      "$tool" -V 2>&1 | head -n 1 || true
    else
      "$tool" --version 2>&1 | head -n 1 || true
    fi
  else
    printf 'NOT INSTALLED\n'
  fi
done
printf '\nProvider login status is intentionally not inspected.\n'
printf 'Open separate terminals for claude, codex and agy sign-in.\n'
