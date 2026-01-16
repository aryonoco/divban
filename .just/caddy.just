# Caddy Reverse Proxy Service Management

set shell := ["bash", "-euo", "pipefail", "-c"]
set positional-arguments
set quiet

# Configuration
USER := "caddy"
UID := "1100"
SERVICE := "caddy.service"
CONTAINER := "caddy"
DATA_DIR := "/srv/caddy"
IMAGE := "docker.io/library/caddy:2-alpine"

# === Service Control ===

[group('service')]
[doc('Start Caddy')]
start:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user start {{SERVICE}}
    @echo '{{GREEN}}✓ Caddy started{{NORMAL}}'

[group('service')]
[doc('Stop Caddy')]
stop:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user stop {{SERVICE}}
    @echo '{{YELLOW}}■ Caddy stopped{{NORMAL}}'

[group('service')]
[doc('Restart Caddy')]
restart: stop start

[group('service')]
[doc('Reload Caddyfile (zero downtime)')]
reload:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman exec {{CONTAINER}} \
        caddy reload --config /etc/caddy/Caddyfile
    @echo '{{GREEN}}✓ Caddy config reloaded{{NORMAL}}'

[group('service')]
[doc('Show Caddy status')]
status:
    @-sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} \
        systemctl --user status {{SERVICE}} --no-pager

[group('service')]
[doc('Enable Caddy on boot')]
enable:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user enable {{SERVICE}}
    @echo '{{GREEN}}✓ Caddy enabled{{NORMAL}}'

[group('service')]
[doc('Disable Caddy on boot')]
disable:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} systemctl --user disable {{SERVICE}}
    @echo '{{YELLOW}}■ Caddy disabled{{NORMAL}}'

# === Logs ===

[group('logs')]
[doc('View Caddy logs (use -f to follow)')]
logs *args:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} journalctl --user -u {{SERVICE}} "$@"

# === Configuration ===

[group('config')]
[doc('Validate Caddyfile syntax')]
validate:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman exec {{CONTAINER}} \
        caddy validate --config /etc/caddy/Caddyfile
    @echo '{{GREEN}}✓ Caddyfile is valid{{NORMAL}}'

[group('config')]
[doc('Format Caddyfile')]
fmt:
    #!/usr/bin/env bash
    set -euo pipefail
    tmpfile=$(mktemp)
    trap "rm -f '$tmpfile'" EXIT
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman exec {{CONTAINER}} \
        caddy fmt /etc/caddy/Caddyfile > "$tmpfile"
    sudo mv "$tmpfile" {{DATA_DIR}}/Caddyfile
    sudo chown {{USER}}:{{USER}} {{DATA_DIR}}/Caddyfile
    trap - EXIT  # Disable trap since file was moved
    echo -e '{{GREEN}}✓ Caddyfile formatted{{NORMAL}}'

[group('config')]
[doc('Edit Caddyfile with $EDITOR')]
edit:
    sudo -u {{USER}} ${EDITOR:-nano} {{DATA_DIR}}/Caddyfile

# === Maintenance ===

[group('maint')]
[doc('Pull latest image and restart')]
[confirm('Update Caddy? Service will restart.')]
update:
    @echo '{{CYAN}}Pulling latest Caddy image...{{NORMAL}}'
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman pull {{IMAGE}}
    just caddy restart
    @echo '{{GREEN}}✓ Caddy updated{{NORMAL}}'

[group('maint')]
[doc('Execute command in Caddy container')]
[no-exit-message]
exec +cmd:
    sudo -u {{USER}} XDG_RUNTIME_DIR=/run/user/{{UID}} podman exec -it {{CONTAINER}} "$@"

[group('maint')]
[doc('Open interactive shell as caddy user')]
shell:
    sudo machinectl shell {{USER}}@
