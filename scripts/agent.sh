#!/usr/bin/env bash
# One CLI per worktree, attached to its own tmux session.
set -Eeuo pipefail
export PATH="$HOME/.local/bin:$PATH"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
projects_root="${MULTI_AGENT_PROJECTS_ROOT:-/workspaces/projects}"
usage() {
  cat <<'HELP'
Usage:
  bash scripts/agent.sh claude [project-name]
  bash scripts/agent.sh codex  [project-name]
  bash scripts/agent.sh agy    [project-name]
  bash scripts/agent.sh status

An omitted project name runs the CLI in this environment repository.
With a project name, the CLI uses only its own Git worktree.
Detach tmux: Ctrl-b then d. Reconnect by running the same command.
Sessions persist through terminal disconnections but not Codespace shutdown.
HELP
}
agent="${1:-help}"
if [[ "$agent" == status ]]; then
  tmux list-sessions -F '#{session_name}  #{session_windows} windows' 2>/dev/null || echo "No tmux sessions."
  exit 0
fi
case "$agent" in claude|codex|agy) ;; help|-h|--help) usage; exit 0 ;; *) usage; exit 2 ;; esac
[[ $# -le 2 ]] || { usage; exit 2; }
bin="$(command -v "$agent" || true)"
[[ -n "$bin" ]] || { echo "Not installed: $agent" >&2; exit 1; }
if [[ $# -eq 2 ]]; then
  project="$2"
  [[ "$project" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$ ]] ||
    { echo "Invalid project name." >&2; exit 2; }
  dir="$projects_root/$project/$agent"
  [[ -d "$dir" ]] || { echo "Missing $agent worktree for $project. Run scripts/project.sh add." >&2; exit 1; }
  session="agent-$agent-$project"
else
  dir="$root"
  session="agent-$agent-environment"
fi
if [[ -n "${TMUX:-}" ]]; then
  echo "Already in tmux; launching $agent directly."
  cd "$dir"
  exec "$bin"
fi
[[ -t 0 && -t 1 ]] || { echo "Run this command in an interactive Codespaces terminal." >&2; exit 2; }
echo "Session $session | $dir"
echo "Detach with Ctrl-b, d. Reattach using the same command."
exec tmux new-session -A -s "$session" -c "$dir" "$bin"
