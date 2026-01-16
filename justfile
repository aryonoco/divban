# Cloudlab Service Manager
# Run `just` or `just --list` to see available commands

set shell := ["bash", "-euo", "pipefail", "-c"]
set positional-arguments
set quiet

# Modules - each runs with working directory set to its source directory
mod caddy '.just/caddy.just'
mod actual '.just/actual.just'
mod immich '.just/immich.just'

# Import shared helpers into root namespace
import '.just/_common.just'

# === Default Recipe ===

[default]
[doc('List available commands')]
help:
    @just --list --unsorted

# === Cross-Service Operations ===

[group('all')]
[doc('Show status of all services')]
status:
    @echo '{{BOLD}}{{CYAN}}=== Caddy ==={{NORMAL}}'
    -just caddy status
    @echo ''
    @echo '{{BOLD}}{{CYAN}}=== Actual ==={{NORMAL}}'
    -just actual status
    @echo ''
    @echo '{{BOLD}}{{CYAN}}=== Immich ==={{NORMAL}}'
    -just immich status

[group('all')]
[doc('Start all services (Caddy → Actual → Immich)')]
start-all: && (caddy::start) (actual::start) (immich::start)
    @echo '{{CYAN}}Starting all services...{{NORMAL}}'

[group('all')]
[doc('Stop all services (Immich → Actual → Caddy)')]
stop-all: && (immich::stop) (actual::stop) (caddy::stop)
    @echo '{{YELLOW}}Stopping all services...{{NORMAL}}'

[group('all')]
[doc('Restart all services')]
[confirm('Restart all services? This will cause downtime.')]
restart-all: stop-all start-all

[group('all')]
[doc('Pull latest images and restart all services')]
[confirm('Update all services? This will cause downtime.')]
update-all: (caddy::update) (actual::update) (immich::update)
    @echo '{{GREEN}}✓ All services updated{{NORMAL}}'

[group('all')]
[doc('Backup all service data')]
backup-all: (actual::backup) (immich::backup-db)
    @echo '{{GREEN}}✓ All backups complete{{NORMAL}}'

[group('all')]
[doc('Enable all services to start on boot')]
enable-all: (caddy::enable) (actual::enable) (immich::enable)

[group('all')]
[doc('Disable all services from starting on boot')]
disable-all: (caddy::disable) (actual::disable) (immich::disable)
