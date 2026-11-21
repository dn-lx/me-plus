#!/usr/bin/env bash
# Offline regression check: syntax, guardrails, and Git-worktree isolation.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
for script in scripts/*.sh .devcontainer/install-agents.sh; do bash -n "$script"; done
python3 -m json.tool .devcontainer/devcontainer.json >/dev/null
temp="$(mktemp -d)"
trap 'rm -rf -- "$temp"' EXIT
git init -q -b prod "$temp/fixture"
printf 'fixture\n' > "$temp/fixture/README.md"
git -C "$temp/fixture" add README.md
git -C "$temp/fixture" -c user.name=Test -c user.email=test@example.invalid commit -qm fixture
git -C "$temp/fixture" switch -qc dev
git clone -q --bare "$temp/fixture" "$temp/fixture.git"
export MULTI_AGENT_PROJECTS_ROOT="$temp/projects"
bash scripts/project.sh add "$temp/fixture.git" sample >/dev/null
for agent in claude codex agy; do
  worktree="$(bash scripts/project.sh path sample "$agent")"
  [[ "$worktree" == "$temp/projects/sample/$agent" ]]
  [[ "$(git -C "$worktree" branch --show-current)" == agents/"$agent"/* ]]
  [[ -z "$(git -C "$worktree" status --porcelain)" ]]
done
touch "$MULTI_AGENT_PROJECTS_ROOT/sample/claude/CLAUDE_ONLY"
[[ "$(git -C "$MULTI_AGENT_PROJECTS_ROOT/sample/claude" status --porcelain | wc -l)" -eq 1 ]]
[[ -z "$(git -C "$MULTI_AGENT_PROJECTS_ROOT/sample/codex" status --porcelain)" ]]
[[ -z "$(git -C "$MULTI_AGENT_PROJECTS_ROOT/sample/agy" status --porcelain)" ]]
if bash scripts/project.sh add "$temp/fixture.git" sample >/dev/null 2>&1; then
  echo 'Error: duplicate project allowed' >&2; exit 1
fi
if bash scripts/project.sh path sample unknown >/dev/null 2>&1; then
  echo 'Error: invalid agent allowed' >&2; exit 1
fi
echo 'PASS: config, shell scripts, isolated branches/worktrees, input guards'
