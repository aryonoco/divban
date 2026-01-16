# Common helpers for all service modules
# Imported into root namespace

# Service user UIDs (must match /etc/passwd)
CADDY_UID := "1100"
ACTUAL_UID := "1101"
IMMICH_UID := "1102"

# Private helper to run systemctl as a service user
[private]
_systemctl user uid cmd *args:
    #!/usr/bin/env bash
    set -euo pipefail
    sudo -u "{{user}}" XDG_RUNTIME_DIR="/run/user/{{uid}}" systemctl --user "{{cmd}}" "$@"

# Private helper to run podman as a service user
[private]
_podman user uid *args:
    #!/usr/bin/env bash
    set -euo pipefail
    sudo -u "{{user}}" XDG_RUNTIME_DIR="/run/user/{{uid}}" podman "$@"

# Private helper to run journalctl as a service user
[private]
_journalctl user uid *args:
    #!/usr/bin/env bash
    set -euo pipefail
    sudo -u "{{user}}" XDG_RUNTIME_DIR="/run/user/{{uid}}" journalctl --user "$@"
