# Immich Photo Management Service

set shell := ["bash", "-euo", "pipefail", "-c"]
set positional-arguments
set quiet

# Configuration
USER := "immich"
UID := "1102"
DATA_DIR := "/srv/immich"

# Service names
SVC_SERVER := "immich-server.service"
SVC_ML := "immich-machine-learning.service"
SVC_REDIS := "immich-redis.service"
SVC_POSTGRES := "immich-postgres.service"

# Container names
CTR_POSTGRES := "immich-postgres"

# Images
IMG_SERVER := "ghcr.io/immich-app/immich-server:v1.124.2"
IMG_ML := "ghcr.io/immich-app/immich-machine-learning:v1.124.2"

# === Service Control ===

[group('service')]
[doc('Start all Immich services')]
start:
    @echo '{{CYAN}}Starting Immich services...{{NORMAL}}'
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user start \
        {{SVC_REDIS}} {{SVC_POSTGRES}} {{SVC_ML}} {{SVC_SERVER}}
    @echo '{{GREEN}}✓ Immich started{{NORMAL}}'

[group('service')]
[doc('Stop all Immich services')]
stop:
    @echo '{{YELLOW}}Stopping Immich services...{{NORMAL}}'
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user stop \
        {{SVC_SERVER}} {{SVC_ML}} {{SVC_POSTGRES}} {{SVC_REDIS}}
    @echo '{{YELLOW}}■ Immich stopped{{NORMAL}}'

[group('service')]
[doc('Restart all Immich services')]
restart: stop start

[group('service')]
[doc('Show status of all Immich services')]
status:
    @echo '{{BOLD}}Server:{{NORMAL}}'
    @-sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} \
        systemctl --user status {{SVC_SERVER}} --no-pager -l
    @echo ''
    @echo '{{BOLD}}Machine Learning:{{NORMAL}}'
    @-sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} \
        systemctl --user status {{SVC_ML}} --no-pager -l
    @echo ''
    @echo '{{BOLD}}PostgreSQL:{{NORMAL}}'
    @-sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} \
        systemctl --user status {{SVC_POSTGRES}} --no-pager -l
    @echo ''
    @echo '{{BOLD}}Redis:{{NORMAL}}'
    @-sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} \
        systemctl --user status {{SVC_REDIS}} --no-pager -l

[group('service')]
[doc('Enable all Immich services on boot')]
enable:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user enable \
        {{SVC_REDIS}} {{SVC_POSTGRES}} {{SVC_ML}} {{SVC_SERVER}}
    @echo '{{GREEN}}✓ Immich services enabled{{NORMAL}}'

[group('service')]
[doc('Disable all Immich services on boot')]
disable:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user disable \
        {{SVC_SERVER}} {{SVC_ML}} {{SVC_POSTGRES}} {{SVC_REDIS}}
    @echo '{{YELLOW}}■ Immich services disabled{{NORMAL}}'

# === Logs ===

[group('logs')]
[doc('View server logs (use -f to follow)')]
logs *args:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} journalctl --user -u {{SVC_SERVER}} "$@"

[group('logs')]
[doc('View ML service logs')]
logs-ml *args:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} journalctl --user -u {{SVC_ML}} "$@"

[group('logs')]
[doc('View PostgreSQL logs')]
logs-db *args:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} journalctl --user -u {{SVC_POSTGRES}} "$@"

[group('logs')]
[doc('View Redis logs')]
logs-redis *args:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} journalctl --user -u {{SVC_REDIS}} "$@"

[group('logs')]
[doc('View all service logs combined')]
logs-all *args:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} journalctl --user \
        -u {{SVC_SERVER}} -u {{SVC_ML}} -u {{SVC_POSTGRES}} -u {{SVC_REDIS}} "$@"

# === Maintenance ===

[group('maint')]
[doc('Pull latest images and restart (server + ML only)')]
[confirm('Update Immich? Services will restart.')]
update:
    @echo '{{CYAN}}Pulling latest Immich images...{{NORMAL}}'
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman pull {{IMG_SERVER}}
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman pull {{IMG_ML}}
    just immich restart
    @echo '{{GREEN}}✓ Immich updated{{NORMAL}}'

[group('maint')]
[doc('Backup PostgreSQL database')]
backup-db dest=("{{DATA_DIR}}/backup-db-" + datetime('%Y%m%d-%H%M%S') + ".sql"):
    #!/usr/bin/env bash
    set -euo pipefail
    echo -e '{{CYAN}}Backing up PostgreSQL database...{{NORMAL}}'
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman exec {{CTR_POSTGRES}} \
        pg_dump -U immich immich > "{{dest}}"
    echo -e '{{GREEN}}✓ Database backup created: {{dest}}{{NORMAL}}'

[group('maint')]
[doc('Execute command in server container')]
[no-exit-message]
exec +cmd:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman exec -it immich-server "$@"

[group('maint')]
[doc('Execute command in PostgreSQL container')]
[no-exit-message]
exec-db +cmd:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman exec -it {{CTR_POSTGRES}} "$@"

[group('maint')]
[doc('Open psql shell')]
psql:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman exec -it {{CTR_POSTGRES}} \
        psql -U immich immich

[group('maint')]
[doc('Open interactive shell as immich user')]
shell:
    sudo machinectl shell {{USER}}@
