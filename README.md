# Rootless Podman 5.x Quadlet Stack

Production-ready self-hosted stack with Caddy, Actual Budget, and Immich running as isolated rootless containers using Podman 5.x with pasta networking.

## Architecture

```
                              INTERNET
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                    CADDY (user: caddy, UID 1100)                   │
│                         Network: pasta                              │
│                       Ports: 80, 443 (TLS)                         │
│                                                                     │
│   photos.jenkinsameri.com ──► 127.0.0.1:2283 (Immich)             │
│   budget.jenkinsameri.com ──► 127.0.0.1:5006 (Actual)             │
│   Other domains ──────────────► Remote hosts                       │
└────────────────────────────────────────────────────────────────────┘
            │                                    │
            ▼                                    ▼
┌───────────────────────────┐    ┌─────────────────────────────────┐
│ ACTUAL (user: actual)     │    │ IMMICH (user: immich)           │
│ UID: 1101                 │    │ UID: 1102                       │
│                           │    │                                  │
│ Port: 127.0.0.1:5006      │    │ Port: 127.0.0.1:2283            │
│                           │    │                                  │
│ Volume: actual-data       │    │ ┌────────────────────────────┐  │
└───────────────────────────┘    │ │      immich-net            │  │
                                 │ │   (internal bridge)        │  │
                                 │ │                            │  │
                                 │ │ Server ↔ Postgres ↔ Redis │  │
                                 │ │    ↕                       │  │
                                 │ │ Machine Learning           │  │
                                 │ └────────────────────────────┘  │
                                 │                                  │
                                 │ Volumes: immich-upload,         │
                                 │   immich-postgres-data,         │
                                 │   immich-model-cache            │
                                 └─────────────────────────────────┘
```

## User Allocation

| Service | User | UID | Subordinate UIDs | Port |
|---------|------|-----|------------------|------|
| Caddy | `caddy` | 1100 | 100000-165535 | 80, 443 |
| Actual | `actual` | 1101 | 200000-265535 | 127.0.0.1:5006 |
| Immich | `immich` | 1102 | 300000-365535 | 127.0.0.1:2283 |

## Directory Structure

```
/home/aryan/projects/cloudlab/
├── README.md
├── setup-all.sh                      # Master orchestrator
│
├── caddy/
│   ├── setup.sh                      # Caddy setup script
│   ├── caddy-svc.sh                  # Service manager
│   ├── caddy.container               # Quadlet definition
│   ├── caddy-data.volume             # TLS certificates volume
│   ├── caddy-config.volume           # Caddy config volume
│   └── Caddyfile                     # Reverse proxy config
│
├── actual/
│   ├── setup.sh                      # Actual Budget setup
│   ├── actual-svc.sh                 # Service manager
│   ├── actual.container              # Quadlet definition
│   └── actual-data.volume            # Budget data volume
│
└── immich/
    ├── setup.sh                      # Immich setup
    ├── immich-svc.sh                 # Service manager
    ├── immich.env.example            # Environment template
    ├── immich.network                # Internal network
    ├── immich-upload.volume          # Photo uploads volume
    ├── immich-postgres-data.volume   # Database volume
    ├── immich-model-cache.volume     # ML model cache volume
    ├── immich-redis.container        # Valkey cache
    ├── immich-postgres.container     # PostgreSQL with VectorChord
    ├── immich-machine-learning.container  # ML service (CPU-only)
    └── immich-server.container       # Main server
```

## Quick Start

```bash
# 1. Run complete setup
sudo ./setup-all.sh --install-helpers

# 2. Edit Caddyfile with your domains
sudo nano /srv/caddy/Caddyfile

# 3. Start services
caddy-svc start
actual-svc start
immich-svc start

# 4. Enable auto-start
caddy-svc enable
actual-svc enable
immich-svc enable
```

## Service Managers

Helper scripts are installed to `~/.local/bin/`:

```bash
# Caddy
caddy-svc start|stop|restart|reload|status|enable|disable
caddy-svc logs [-f]
caddy-svc validate|fmt
caddy-svc update

# Actual Budget
actual-svc start|stop|restart|status|enable|disable
actual-svc logs [-f]
actual-svc backup
actual-svc update

# Immich
immich-svc start|stop|restart|status|enable|disable
immich-svc logs [server|postgres|redis|ml|all] [-f]
immich-svc ps|health
immich-svc backup-db [filename]
immich-svc update
```

Ensure `~/.local/bin` is in your PATH:
```bash
echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> ~/.bashrc
```

## Key Features

- **Podman 5.x**: Uses pasta networking (default in Podman 5.x)
- **Fully Rootless**: All containers run without root privileges
- **Named Volumes**: Uses Podman volumes for data persistence
- **Network Isolation**: Services bind only to localhost; external access via Caddy
- **TLS Everywhere**: Caddy auto-provisions Let's Encrypt certificates
- **CPU-Only ML**: Immich machine learning runs without GPU acceleration

## Security Model

1. **User Isolation**: Each service runs as a dedicated unprivileged user
2. **Network Isolation**: Services bind only to localhost; external access via Caddy
3. **UID Namespace Isolation**: Non-overlapping subordinate UID ranges
4. **No Root Daemon**: All containers run rootless
5. **TLS Everywhere**: Caddy auto-provisions Let's Encrypt certificates
6. **Secrets Management**: Environment files with `chmod 600`

## Maintenance

### Update Containers

```bash
caddy-svc update
actual-svc update
immich-svc update
```

### Backup

```bash
# Actual Budget (volume export)
podman volume export actual-data > actual-backup.tar

# Immich database
immich-svc backup-db /backup/immich-db.sql

# Immich photos (volume export)
podman volume export immich-upload > immich-photos.tar
```

### View Logs

```bash
# Follow all logs (system journal)
journalctl -f | grep -E 'caddy|actual|immich'

# Per-service
caddy-svc logs -f
actual-svc logs -f
immich-svc logs all -f
```

## Troubleshooting

### Port Binding Fails (Caddy)

```bash
# Check sysctl
sysctl net.ipv4.ip_unprivileged_port_start
# Should be 80. Caddy setup configures this automatically.
```

### Service Won't Start

```bash
# Validate quadlet syntax
sudo -u caddy XDG_RUNTIME_DIR=/run/user/1100 \
    /usr/libexec/podman/quadlet --user --dryrun

# Check generated systemd unit
sudo -u caddy XDG_RUNTIME_DIR=/run/user/1100 \
    systemctl --user cat caddy.service
```

### Connection Refused

```bash
# Verify services are listening
ss -tlnp | grep -E '5006|2283|80|443'

# Test from Caddy's perspective
curl -v http://127.0.0.1:5006
curl -v http://127.0.0.1:2283
```

### Verify Pasta Networking

```bash
# Check containers.conf for each user
sudo -u caddy cat /home/caddy/.config/containers/containers.conf
sudo -u actual cat /home/actual/.config/containers/containers.conf
sudo -u immich cat /home/immich/.config/containers/containers.conf
```

## Requirements

- Bash 5.2+
- Podman 5.0+ (with pasta networking)
- systemd with user session support
- `loginctl enable-linger` capability

## License

MIT
