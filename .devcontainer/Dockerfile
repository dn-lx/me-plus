# Me+ GitHub Codespaces: independent Claude Code, Codex and Antigravity CLI.
# Never build personal credentials or API keys into an image.
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
     git curl ca-certificates python3 python3-venv jq tmux \
     dbus-user-session dbus-x11 gnome-keyring libsecret-1-0 \
  && rm -rf /var/lib/apt/lists/*
