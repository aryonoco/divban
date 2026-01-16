# Actual Budget Service Management

set shell := ["bash", "-euo", "pipefail", "-c"]
set positional-arguments
set quiet

# Configuration
USER := "actual"
UID := "1101"
SERVICE := "actual.service"
CONTAINER := "actual-server"
DATA_DIR := "/srv/actual"
IMAGE := "docker.io/actualbudget/actual-server:latest"
VOLUME := "actual-data"

# === Service Control ===

[group('service')]
[doc('Start Actual')]
start:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user start {{SERVICE}}
    @echo '{{GREEN}}✓ Actual started{{NORMAL}}'

[group('service')]
[doc('Stop Actual')]
stop:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user stop {{SERVICE}}
    @echo '{{YELLOW}}■ Actual stopped{{NORMAL}}'

[group('service')]
[doc('Restart Actual')]
restart: stop start

[group('service')]
[doc('Show Actual status')]
status:
    @-sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} \
        systemctl --user status {{SERVICE}} --no-pager

[group('service')]
[doc('Enable Actual on boot')]
enable:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user enable {{SERVICE}}
    @echo '{{GREEN}}✓ Actual enabled{{NORMAL}}'

[group('service')]
[doc('Disable Actual on boot')]
disable:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user disable {{SERVICE}}
    @echo '{{YELLOW}}■ Actual disabled{{NORMAL}}'

# === Logs ===

[group('logs')]
[doc('View Actual logs (use -f to follow)')]
logs *args:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} journalctl --user -u {{SERVICE}} "$@"

# === Maintenance ===

[group('maint')]
[doc('Pull latest image and restart')]
[confirm('Update Actual? Service will restart.')]
update:
    @echo '{{CYAN}}Pulling latest Actual image...{{NORMAL}}'
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman pull {{IMAGE}}
    just actual restart
    @echo '{{GREEN}}✓ Actual updated{{NORMAL}}'

[group('maint')]
[doc('Backup Actual data volume')]
backup dest=("{{DATA_DIR}}/backup-" + datetime('%Y%m%d-%H%M%S') + ".tar"):
    #!/usr/bin/env bash
    set -euo pipefail
    echo -e '{{CYAN}}Exporting volume to {{dest}}...{{NORMAL}}'
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman volume export {{VOLUME}} > "{{dest}}"
    echo -e '{{GREEN}}✓ Backup created: {{dest}}{{NORMAL}}'
    echo -e '{{CYAN}}To restore: podman volume import {{VOLUME}} < {{dest}}{{NORMAL}}'

[group('maint')]
[doc('Execute command in Actual container')]
[no-exit-message]
exec +cmd:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman exec -it {{CONTAINER}} "$@"

[group('maint')]
[doc('Open interactive shell as actual user')]
shell:
    sudo machinectl shell {{USER}}@
