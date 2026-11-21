#!/usr/bin/env bash
# Safe diagnostics: never display credentials, tokens or environment values.
set -Eeuo pipefail
export PATH="$HOME/.local/bin:$PATH"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$root"
printf 'Workspace: %s\n' "$PWD"
printf 'Git branch: %s\n' "$(git branch --show-current 2>/dev/null || echo none)"
printf 'Git state: '
if [[ -z "$(git status --porcelain)" ]]; then echo clean; else echo "local changes present"; fi
printf 'Platform: '; uname -sm
echo
for bin in git gh node npm python3 rg tmux claude codex agy; do
  printf '%-11s' "$bin"
  if command -v "$bin" >/dev/null 2>&1; then
    if [[ "$bin" == tmux ]]; then "$bin" -V 2>&1 | head -n 1 || true
    else "$bin" --version 2>&1 | head -n 1 || true; fi
  else
    echo 'NOT INSTALLED'
  fi
done
echo
printf 'Project workspaces: '
project_root="${MULTI_AGENT_PROJECTS_ROOT:-/workspaces/projects}"
if [[ -d "$project_root" ]]; then
  find "$project_root" -mindepth 1 -maxdepth 1 -type d | wc -l
else
  echo 0
fi
if [[ "${1:-}" == --auth ]]; then
  echo
  printf 'Codex: '
  codex login status 2>&1 | head -n 1 || true
  printf 'Claude: '
  if command -v claude >/dev/null; then
    auth_json="$(claude auth status 2>/dev/null || true)"
    printf '%s' "$auth_json" | python3 -c 'import json,sys; print("logged in" if json.load(sys.stdin).get("loggedIn") else "not logged in")' 2>/dev/null || echo 'status unavailable'
  else echo 'not installed'; fi
  echo 'Antigravity: check authentication interactively in agy; model listing alone does not prove sign-in.'
  echo 'Credentials were not printed.'
elif [[ "${1:-}" != "" ]]; then
  echo 'Usage: bash scripts/doctor.sh [--auth]' >&2
  exit 2
fi
