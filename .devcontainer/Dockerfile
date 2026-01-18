# SPDX-License-Identifier: 0BSD
# SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
#
# =============================================================================
# divban Development Container
# Bun + TypeScript + Podman for Quadlet testing
# =============================================================================

FROM mcr.microsoft.com/devcontainers/base:debian-13

ENV DEBIAN_FRONTEND=noninteractive

# Build arguments for version management
ARG BUN_VERSION=1.3.6

# Environment variables
ENV BUN_VERSION=${BUN_VERSION}
ENV PATH="/home/vscode/.bun/bin:${PATH}"
ENV SHELL=/bin/zsh

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build essentials
    build-essential \
    curl \
    wget \
    git \
    # Editors
    vim \
    # Shell utilities
    shellcheck \
    shfmt \
    fzf \
    # JSON/TOML/data processing
    jq \
    yq \
    # Modern CLI tools
    ripgrep \
    fd-find \
    tree \
    htop \
    bat \
    # Archive utilities
    zip \
    unzip \
    tar \
    gzip \
    # File utilities (commonly used by Claude Code)
    file \
    less \
    patch \
    diffutils \
    # Process and system utilities
    procps \
    bc \
    xxd \
    # Network utilities
    netcat-openbsd \
    # Modern ls/tree replacement
    eza \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Podman 5.x with modern rootless networking (pasta)
RUN apt-get update && apt-get install -y --no-install-recommends \
    podman \
    crun \
    passt \
    fuse-overlayfs \
    uidmap \
    reuse \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Switch to vscode user for Bun installation
USER vscode
WORKDIR /home/vscode

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"

# Verify installation
RUN ~/.bun/bin/bun --version

# Configure rootless Podman storage
RUN mkdir -p /home/vscode/.config/containers && \
    printf '%s\n' \
      '[storage]' \
      'driver = "overlay"' \
      '[storage.options.overlay]' \
      'mount_program = "/usr/bin/fuse-overlayfs"' \
      > /home/vscode/.config/containers/storage.conf

# Reset to root for devcontainer features
USER root

WORKDIR /workspaces/divban
