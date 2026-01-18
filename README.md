<!--
SPDX-License-Identifier: CC-BY-4.0
SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
-->

# divban

![License](https://img.shields.io/badge/license-MPL--2.0-blue)
![Bun](https://img.shields.io/badge/bun-1.0%2B-f9f1e1)
![Platform](https://img.shields.io/badge/platform-Linux-lightgrey)

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
