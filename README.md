<!--
SPDX-License-Identifier: CC-BY-4.0
SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
-->

# divban

Unified CLI for managing rootless Podman services with systemd Quadlet integration.

## Features

- **Rootless containers**: All services run without root privileges
- **Systemd integration**: Uses Quadlet for native systemd service management
- **Pasta networking**: Modern Podman 5.x networking (default)
- **User isolation**: Each service runs as a dedicated user with separate UID namespace
- **TOML configuration**: Declarative service configuration
- **Multi-container stacks**: Orchestrates complex services like Immich

## Supported Services

| Service | Description | Containers |
|---------|-------------|------------|
| Caddy | Reverse proxy with automatic HTTPS | 1 |
| Immich | Photo management with ML | 4 (server, ML, Redis, Postgres) |
| Actual | Personal finance/budgeting | 1 |

## Installation

```bash
# Clone and install dependencies
git clone https://github.com/yourusername/divban.git
cd divban
bun install

# Build standalone binary (optional)
bun build src/index.ts --compile --outfile divban
```

## Usage

```bash
# Validate configuration
divban caddy validate examples/divban-caddy.toml
divban immich validate examples/divban-immich.toml
divban actual validate examples/divban-actual.toml

# Generate Quadlet files (dry run)
divban caddy generate examples/divban-caddy.toml --output ./out

# Show what would change
divban caddy diff examples/divban-caddy.toml

# Full setup (creates user, directories, installs quadlets)
sudo divban caddy setup examples/divban-caddy.toml

# Service management
divban caddy start
divban caddy stop
divban caddy restart
divban caddy status
divban caddy logs [-f] [-n 100]

# Caddy-specific: graceful config reload
divban caddy reload

# Updates
divban caddy update

# Backup/restore
divban immich backup
divban immich restore backup-2024-01-18.sql
divban actual backup
```

## Configuration

Services are configured via TOML files. See `examples/` for complete examples.

### Caddy (`divban-caddy.toml`)

```toml
[paths]
dataDir = "/srv/divban-caddy"

[container]
image = "docker.io/library/caddy:2-alpine"
autoUpdate = "registry"

[[container.ports]]
host = 80
container = 80

[[container.ports]]
host = 443
container = 443

[caddyfile.global]
email = "admin@example.com"

[[caddyfile.sites]]
addresses = ["photos.example.com"]
[[caddyfile.sites.directives]]
name = "reverse_proxy"
args = ["localhost:2283"]
```

### Immich (`divban-immich.toml`)

```toml
[paths]
dataDir = "/srv/divban-immich"

[database]
database = "immich"
username = "immich"
password = "change-me-in-production"

[hardware]
transcoding = "disabled"  # or: nvenc, qsv, vaapi, vaapi-wsl, rkmpp
ml = "disabled"           # or: cuda, openvino, armnn, rknn

publicUrl = "https://photos.example.com"
```

### Actual (`divban-actual.toml`)

```toml
[paths]
dataDir = "/srv/divban-actual"

[container]
image = "docker.io/actualbudget/actual-server:latest"

[network]
port = 5006
host = "127.0.0.1"
```

## Architecture

```
divban <service> <command> [config] [options]
       │
       ├── validate    Validate TOML configuration
       ├── generate    Generate Quadlet files
       ├── diff        Show pending changes
       ├── setup       Create user, directories, install quadlets
       ├── start       Start service via systemctl
       ├── stop        Stop service
       ├── restart     Restart service
       ├── status      Show service status
       ├── logs        View service logs
       ├── update      Pull latest images and restart
       ├── backup      Backup service data
       ├── restore     Restore from backup
       └── reload      (Caddy only) Graceful config reload
```

### User Management

Each service gets a dedicated system user:
- Username: `divban-<service>` (e.g., `divban-caddy`)
- UID: Dynamically allocated from range 10000-59999
- Subuid: Dynamically allocated non-overlapping ranges

### Generated Files

```
/home/divban-caddy/
└── .config/containers/systemd/
    ├── caddy.container
    └── caddy-data.volume

/srv/divban-caddy/
├── Caddyfile
└── data/
```

## Requirements

- Bun 1.0+
- Podman 5.0+ (with pasta networking)
- systemd with user session support
- Root privileges for setup (user creation, directory ownership)

## Development

```bash
# Run directly
bun run src/index.ts caddy validate examples/divban-caddy.toml

# Type check
bun run tsc --noEmit

# Format
bunx @biomejs/biome format --write .

# Lint
bunx @biomejs/biome check .
```

## License

MIT
