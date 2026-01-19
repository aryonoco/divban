<!--
SPDX-License-Identifier: CC-BY-4.0
SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
-->

# divban

[![REUSE](https://api.reuse.software/badge/github.com/aryonoco/divban)](https://api.reuse.software/info/github.com/aryonoco/divban)
![License](https://img.shields.io/badge/license-MPL--2.0-blue)
![Bun](https://img.shields.io/badge/bun-1.0%2B-f9f1e1)
![Platform](https://img.shields.io/badge/platform-Linux-lightgrey)

A unified CLI for managing rootless Podman services with systemd and Quadlets.

## Overview

divban is a CLI tool for managing rootless Podman containers through systemd Quadlet generation and integration. It enables declarative TOML-based setup of containerised services and generates the required Quadlets and runs each service as an isolated system user with its own UID namespace.

Setting up rootless Podman containers with systemd integration can be complex:

- Creating dedicated users with proper SUBUID/SUBGID ranges
- Writing Quadlet files (.container, .network, .volume)
- Managing container lifecycles via systemd user sessions
- Handling multi container services with dependencies

divban automates these through a single declarative configuration file, hoping to achieve the simplicity of docker compose while taking advantage of Podman's features including running rootless by default, ability to auto-update containers (no `watchtower` or `diun` needed) and management of all processes using systemd, journald and friends.

## The Name

*Divban* (دیوبان, IPA: /diːvˈbɒːn/) is Persian for "keeper of demons." It combines [*div*](https://en.wikipedia.org/wiki/Div_(mythology)), a demon or chaotic spirit in [Zoroastrian](https://en.wikipedia.org/wiki/Zoroastrianism) tradition (from Avestan [*daēva*](https://en.wikipedia.org/wiki/Daeva)), with *-bān*: "keeper" or "guardian".

Divban reflects this tool's purpose: containers are powerful but chaotic forces that, left unmanaged, consume resources and run with excessive privileges. Inspired by the legendary [king Tahmuras](https://en.wikipedia.org/wiki/Tahmuras), the mythical demon binder, divban constrains daemons through user namespaces, resource limits, and systemd integration, harnessing their power for productive work.

## Supported Services

| Service | Description | Containers |
|---------|-------------|------------|
| Caddy | Reverse proxy with automatic HTTPS | 1 |
| Immich | Self-hosted photo management with ML | 4 |
| Actual | Personal finance management | 1 |

## Requirements

- Linux with systemd (user session support required)
- Podman 5.0+ with pasta networking
- Root privileges for initial setup only

## Installation

Download the latest release from [GitHub Releases](https://github.com/aryonoco/divban/releases):

| Architecture | Binary | Notes |
|--------------|--------|-------|
| amd64 | `linux-amd64` | Baseline, compatible with older systems |
| amd64v3 | `linux-amd64v3` | Modern CPUs with AVX2+ (2013+) |
| arm64 | `linux-arm64` | Raspberry Pi 4+, cloud ARM instances |

```bash
# Download and extract (example for amd64v3)
VERSION="0.1.0"
curl -fsSL --proto-redir =https --tlsv1.2 -O "https://github.com/aryonoco/divban/releases/download/v${VERSION}/divban-${VERSION}-linux-amd64v3.tar.zst"
tar -xf "divban-${VERSION}-linux-amd64v3.tar.zst"

# Install to ~/.local/bin
mkdir -p ~/.local/bin
install -m 755 "divban-${VERSION}-linux-amd64v3/divban" ~/.local/bin/
```

If `~/.local/bin` is not in your PATH, add it:

```bash
# bash (~/.bashrc)
export PATH="$HOME/.local/bin:$PATH"

# zsh (~/.zshrc)
export PATH="$HOME/.local/bin:$PATH"

# fish (~/.config/fish/config.fish)
fish_add_path ~/.local/bin
```

To allow running divban with sudo (required for setup commands):

```bash
sudo ln -s "$HOME/.local/bin/divban" /usr/local/bin/divban
```

### Building from Source

If you want to modify the code. Requires [Bun](https://bun.sh) 1.3+:

```bash
git clone https://github.com/aryonoco/divban.git
cd divban
bun install
bun run build
# Binary output: bin/divban
```

## Usage

```
divban <service> <command> [config] [options]
```

### Commands

| Command | Description |
|---------|-------------|
| validate | Validate TOML configuration |
| generate | Generate Quadlet files |
| diff | Show pending changes |
| setup | Create user, directories, and install quadlets |
| start | Start the service |
| stop | Stop the service |
| restart | Restart the service |
| status | Show service status |
| logs | View service logs |
| update | Pull latest images and restart |
| backup | Back up service data |
| restore | Restore from backup |
| reload | Graceful config reload (Caddy only) |

The special service name `all` may be used to run commands across all registered services.

## Configuration

Services are configured via TOML files. Example configurations are provided in the `examples/` directory.

### Search Paths

Configuration files are searched in the following order:

1. Path specified on command line
2. `./divban-<service>.toml`
3. `./<service>/divban-<service>.toml`
4. `/etc/divban/divban-<service>.toml`

## Architecture

Each service runs as a dedicated system user (`divban-<service>`) with:

- Dynamically allocated UID from range 10000-59999
- Isolated UID namespace mapping
- Quadlet files installed to `~/.config/containers/systemd/`
- Data stored in directory (default: `/srv/divban-<service>/`)

## Development

```bash
just dev                 # Run in development mode
just test                # Run tests
just check               # Run linter and type checker
just fmt                 # Format code
just ci                  # Run full CI pipeline
```

## AI/LLM Disclosure

This project was developed with significant LLM involvement. I'm a systems architect by trade, not a programmer. I designed the core logic, made technical decisions and directed development, but AI/LLM tools generated most of the code.

All code was reviewed, tested, and iterated on by me. The design choices (Result types over exceptions, branded types for type safety, service abstraction patterns, etc.) are mine. The TypeScript syntax is not.
I'm publishing this because it works for me, not because of how it was written.

## Licence

Copyright 2026 Aryan Ameri.

| Content | Licence |
|---------|---------|
| Source code (`src/`, `tests/`) | [MPL-2.0](LICENSES/MPL-2.0.txt) |
| Config/plumbing | [0BSD](LICENSES/0BSD.txt) |
| Documentation | [CC-BY-4.0](LICENSES/CC-BY-4.0.txt) |

This project is [REUSE](https://reuse.software/) compliant. See [REUSE.toml](REUSE.toml) for details.
