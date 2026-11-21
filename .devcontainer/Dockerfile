# Lean Linux Codespace for three independent coding CLIs.
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates curl git git-lfs jq openssh-client \
       python3 python3-venv tmux ripgrep \
       dbus-user-session dbus-x11 gnome-keyring libsecret-tools \
    && rm -rf /var/lib/apt/lists/*
