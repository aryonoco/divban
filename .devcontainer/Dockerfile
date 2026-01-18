# SPDX-License-Identifier: MIT
# =============================================================================
# divban Development Container
# Bun + TypeScript + Podman for Quadlet testing
# =============================================================================

FROM mcr.microsoft.com/devcontainers/base:debian-13

ENV DEBIAN_FRONTEND=noninteractive

# Build arguments for version management
ARG BUN_VERSION=1.2.8

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
    # Shell utilities
    shellcheck \
    shfmt \
    fzf \
    # JSON/TOML processing
    jq \
    # Modern CLI tools
    ripgrep \
    fd-find \
    tree \
    htop \
    bat \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Switch to vscode user for Bun installation
USER vscode
WORKDIR /home/vscode

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"

# Verify installation
RUN ~/.bun/bin/bun --version

# Reset to root for devcontainer features
USER root

WORKDIR /workspaces/divban
