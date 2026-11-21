# Minimal Linux Codespace for three independent coding agents.
# Credentials are never built into the image.
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates curl git jq openssh-client \
       python3 python3-venv tmux \
       dbus-user-session dbus-x11 gnome-keyring libsecret-tools \
    && rm -rf /var/lib/apt/lists/*
