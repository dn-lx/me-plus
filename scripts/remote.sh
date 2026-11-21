#!/usr/bin/env bash
# Reconnect the already-paired Desktop Commander remote device after Codespace startup.
# No credentials are checked in. Default flag allows Codespaces to sleep normally.
set -Eeuo pipefail
name="multiagent-remote"
usage() { echo "Usage: bash scripts/remote.sh [start|status|attach|stop]"; }
running() {
  pgrep -u "$(id -u)" -f 'npm exec @wonderwhy-er/desktop-commander@latest remote' >/dev/null ||
    pgrep -u "$(id -u)" -f 'desktop-commander remote' >/dev/null
}
case "${1:-status}" in
  status)
    if running; then echo "Desktop Commander remote process: running"; else echo "Desktop Commander remote process: not running"; fi
    if tmux has-session -t "$name" 2>/dev/null; then echo "tmux session: $name"; fi
    ;;
  start)
    if running; then
      echo "Desktop Commander is already running (not starting a duplicate)."
      exit 0
    fi
    if tmux has-session -t "$name" 2>/dev/null; then
      echo "Session $name exists; run 'bash scripts/remote.sh attach' to inspect."
      exit 0
    fi
    tmux new-session -d -s "$name" \
      'exec npx --yes @wonderwhy-er/desktop-commander@latest remote --disable-no-sleep'
    echo "Started Desktop Commander remote in tmux."
    echo "If pairing is required, run 'bash scripts/remote.sh attach' and follow the official prompt."
    echo "The flag --disable-no-sleep avoids requesting that this process keep the Codespace awake."
    ;;
  attach)
    exec tmux attach-session -t "$name"
    ;;
  stop)
    if tmux has-session -t "$name" 2>/dev/null; then
      tmux kill-session -t "$name"
      echo "Stopped the managed remote session. Pairing credentials were not removed."
    else
      echo "No managed session. A manually launched remote process was left untouched."
    fi
    ;;
  *) usage; exit 2 ;;
esac
