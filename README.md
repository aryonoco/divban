<!--
SPDX-License-Identifier: CC-BY-4.0
SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
-->

# divban

A unified CLI for managing rootless Podman services with systemd Quadlet integration.

## Overview

divban provides declarative TOML-based configuration for deploying and managing containerised services. Each service is run as a dedicated system user with isolated UID namespaces, and is managed through systemd user sessions.

## Supported Services

| Service | Description | Containers |
|---------|-------------|------------|
| Caddy | Reverse proxy with automatic HTTPS | 1 |
| Immich | Self-hosted photo management with ML | 4 |
| Actual | Personal finance management | 1 |

## Requirements

- Bun 1.0+
- Podman 5.0+ (with pasta networking)
- systemd with user session support
- Root privileges for initial setup

## Installation

```bash
git clone https://github.com/yourusername/divban.git
cd divban
bun install
bun build src/index.ts --compile --outfile divban
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

### Hardware Acceleration (Immich)

Immich supports hardware acceleration for video transcoding and machine learning:

- **Transcoding**: NVIDIA NVENC, Intel QSV, VA-API, Rockchip MPP
- **ML**: NVIDIA CUDA, Intel OpenVINO, ARM NN, Rockchip NPU, AMD ROCm

## Architecture

Each service runs as a dedicated system user (`divban-<service>`) with:

- Dynamically allocated UID from range 10000-59999
- Isolated UID namespace mapping
- Quadlet files installed to `~/.config/containers/systemd/`
- Data stored in configurable directory (default: `/srv/divban-<service>/`)

## Development

```bash
just dev                 # Run in development mode
just test                # Run tests
just check               # Run linter and type checker
just fmt                 # Format code
just ci                  # Run full CI pipeline
```

## Licence

MIT
