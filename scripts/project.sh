#!/usr/bin/env bash
# Independent Git worktrees for Claude, Codex and Antigravity.
set -Eeuo pipefail
ROOT="${MULTI_AGENT_PROJECTS_ROOT:-/workspaces/projects}"
usage() {
  cat <<'HELP'
Usage:
  bash scripts/project.sh add <git-url-or-path> [project-name]
  bash scripts/project.sh list
  bash scripts/project.sh status <project-name>
  bash scripts/project.sh path <project-name> <claude|codex|agy>

Clones once into /workspaces/projects/NAME/source and creates three isolated
branches/worktrees for Claude Code, Codex, and Antigravity.
Set MULTI_AGENT_PROJECTS_ROOT to override the destination.
HELP
}
safe_name() {
  [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$ ]] ||
    { echo "Invalid project name: use letters, digits, underscores and hyphens." >&2; exit 2; }
}
agent_name() {
  case "$1" in claude|codex|agy) ;; *) echo "Unknown agent: $1" >&2; exit 2 ;; esac
}
action="${1:-help}"
case "$action" in
  add)
    [[ $# -ge 2 && $# -le 3 ]] || { usage; exit 2; }
    remote="$2"
    proposed="${remote##*/}"
    proposed="${proposed%.git}"
    project="${3:-$proposed}"
    safe_name "$project"
    target="$ROOT/$project"
    [[ ! -e "$target" ]] || { echo "Already exists: $target" >&2; exit 1; }
    mkdir -p "$ROOT"
    git clone -- "$remote" "$target/source"
    source="$target/source"
    git -C "$source" remote set-head origin -a >/dev/null 2>&1 || true
    if git -C "$source" show-ref --verify --quiet refs/remotes/origin/dev; then
      base="origin/dev"
    else
      base="$(git -C "$source" symbolic-ref --quiet --short refs/remotes/origin/HEAD || true)"
      [[ -n "$base" ]] || base="HEAD"
    fi
    stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
    for agent in claude codex agy; do
      branch="agents/$agent/$stamp"
      git -C "$source" worktree add -b "$branch" "$target/$agent" "$base"
    done
    echo "Project: $project | base: $base"
    for agent in claude codex agy; do
      echo "$agent: $target/$agent"
    done
    echo "Review changes and open PRs from each agent's branch; never merge automatically."
    ;;
  list)
    if [[ ! -d "$ROOT" ]]; then echo "No projects created yet."; exit 0; fi
    shopt -s nullglob
    for dir in "$ROOT"/*; do
      [[ -d "$dir/source/.git" || -f "$dir/source/.git" ]] || continue
      printf '%s\n' "${dir##*/}"
    done
    ;;
  status)
    [[ $# -eq 2 ]] || { usage; exit 2; }
    safe_name "$2"
    target="$ROOT/$2"
    [[ -d "$target/source" ]] || { echo "Project not found: $2" >&2; exit 1; }
    for part in source claude codex agy; do
      if [[ -d "$target/$part" ]]; then
        echo "[$part] $target/$part"
        git -C "$target/$part" status --short --branch
      fi
    done
    ;;
  path)
    [[ $# -eq 3 ]] || { usage; exit 2; }
    safe_name "$2"
    agent_name "$3"
    target="$ROOT/$2/$3"
    [[ -d "$target" ]] || { echo "No worktree: $target" >&2; exit 1; }
    echo "$target"
    ;;
  help|-h|--help) usage ;;
  *) usage; exit 2 ;;
esac
