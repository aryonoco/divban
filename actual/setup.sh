#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#===============================================================================
# setup.sh - Actual Budget Rootless Podman Setup
#
# DESCRIPTION:
#   Installs Actual Budget as a rootless Podman quadlet with dedicated service
#   user. Binds to localhost only for reverse proxy access via Caddy.
#   Non-interactive and idempotent.
#
# REQUIREMENTS:
#   Bash 5.2+
#   Podman 4.4+ (5.0+ recommended)
#   systemd with user lingering support
#
# USAGE:
#   sudo ./setup.sh
#   sudo ./setup.sh --dry-run --verbose
#   sudo ./setup.sh --uid 1101 --subuid-start 200000
#
# OPTIONS:
#   --uid UID            Service user UID (default: 1101)
#   --subuid-start NUM   Starting subordinate UID (default: 200000)
#   --dry-run            Show what would be done without making changes
#   --verbose, -v        Enable verbose output
#   --help, -h           Show this help message
#
# LICENSE: MIT
#===============================================================================

#-------------------------------------------------------------------------------
# Bash Version Check
#-------------------------------------------------------------------------------
if ((BASH_VERSINFO[0] < 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] < 2))); then
    printf 'Error: Bash 5.2+ required. Current: %s\n' "${BASH_VERSION}" >&2
    exit 1
fi

#-------------------------------------------------------------------------------
# Strict Mode
#-------------------------------------------------------------------------------
set -o errexit
set -o errtrace
set -o nounset
set -o pipefail
shopt -s extglob
shopt -s globskipdots
shopt -s inherit_errexit

#-------------------------------------------------------------------------------
# Constants
#-------------------------------------------------------------------------------
declare -r SCRIPT_NAME="${0##*/}"
declare -r SCRIPT_VERSION="1.0.0"
declare -r SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

declare -r SERVICE_USER="actual"
declare -ri DEFAULT_UID=1101
declare -ri DEFAULT_SUBUID_START=200000
declare -r DATA_DIR="/srv/actual"

declare -ri EXIT_SUCCESS=0
declare -ri EXIT_GENERAL_ERROR=1
declare -ri EXIT_INVALID_ARGS=2
declare -ri EXIT_ROOT_REQUIRED=3
declare -ri EXIT_DEPENDENCY_MISSING=4

declare -ra REQUIRED_COMMANDS=(
    podman systemctl loginctl useradd getent mkdir cp chmod chown install
)

declare -ra QUADLET_FILES=(
    actual.container
    actual-data.volume
)

#-------------------------------------------------------------------------------
# Global State
#-------------------------------------------------------------------------------
declare -i SERVICE_UID="${ACTUAL_UID:-${DEFAULT_UID}}"
declare -i SUBUID_START="${ACTUAL_SUBUID_START:-${DEFAULT_SUBUID_START}}"
declare DRY_RUN=false
declare VERBOSE=false

#-------------------------------------------------------------------------------
# Terminal Colors
#-------------------------------------------------------------------------------
declare -A COLORS
if [[ -t 1 && ${TERM:-dumb} != dumb ]]; then
    COLORS=(
        [red]='\033[0;31m'
        [green]='\033[0;32m'
        [yellow]='\033[0;33m'
        [blue]='\033[0;34m'
        [cyan]='\033[0;36m'
        [bold]='\033[1m'
        [reset]='\033[0m'
    )
else
    COLORS=([red]='' [green]='' [yellow]='' [blue]='' [cyan]='' [bold]='' [reset]='')
fi

#-------------------------------------------------------------------------------
# Logging
#-------------------------------------------------------------------------------
_log() {
    local -r level="$1" color="$2" msg="$3"
    printf '%b[%-5s]%b %s\n' "${COLORS[${color}]}" "${level}" "${COLORS[reset]}" "${msg}"
}

log_info()    { _log "INFO"  "blue"   "$1"; }
log_success() { _log "OK"    "green"  "$1"; }
log_warn()    { _log "WARN"  "yellow" "$1" >&2; }
log_error()   { _log "ERROR" "red"    "$1" >&2; }
log_debug()   { [[ ${VERBOSE} == true ]] && _log "DEBUG" "cyan" "$1"; }

log_step() {
    local -r step="$1" desc="$2"
    printf '\n%b%b[Step %s]%b %s\n' \
        "${COLORS[bold]}" "${COLORS[blue]}" "${step}" "${COLORS[reset]}" "${desc}"
}

die() {
    log_error "$1"
    exit "${2:-${EXIT_GENERAL_ERROR}}"
}

#-------------------------------------------------------------------------------
# Utility Functions
#-------------------------------------------------------------------------------
has_command() {
    command -v "$1" &>/dev/null
}

execute() {
    if [[ ${DRY_RUN} == true ]]; then
        log_info "[DRY-RUN] Would execute: $*"
        return 0
    fi
    log_debug "Executing: $*"
    "$@"
}

user_exists() {
    getent passwd "$1" &>/dev/null
}

subuid_configured() {
    local -r user="$1"
    grep -q "^${user}:" /etc/subuid 2>/dev/null
}

#-------------------------------------------------------------------------------
# Validation
#-------------------------------------------------------------------------------
check_root() {
    ((EUID == 0)) || die "This script must be run as root" "${EXIT_ROOT_REQUIRED}"
}

check_dependencies() {
    log_info "Checking dependencies..."
    local -a missing=()
    local cmd

    for cmd in "${REQUIRED_COMMANDS[@]}"; do
        has_command "${cmd}" || missing+=("${cmd}")
    done

    if ((${#missing[@]} > 0)); then
        die "Missing commands: ${missing[*]}" "${EXIT_DEPENDENCY_MISSING}"
    fi

    log_success "All dependencies available"
}

#-------------------------------------------------------------------------------
# Setup Functions
#-------------------------------------------------------------------------------
create_service_user() {
    log_step "1/6" "Creating service user"

    if user_exists "${SERVICE_USER}"; then
        local existing_uid
        existing_uid=$(id -u "${SERVICE_USER}")
        log_info "User '${SERVICE_USER}' exists (UID: ${existing_uid})"
        SERVICE_UID="${existing_uid}"
        return 0
    fi

    log_info "Creating user '${SERVICE_USER}' (UID: ${SERVICE_UID})"

    execute useradd \
        --uid "${SERVICE_UID}" \
        --create-home \
        --home-dir "/home/${SERVICE_USER}" \
        --shell /usr/sbin/nologin \
        --comment "Actual Budget Service" \
        "${SERVICE_USER}"

    log_success "User created"
}

configure_subordinate_ids() {
    log_step "2/6" "Configuring subordinate UIDs/GIDs"

    if subuid_configured "${SERVICE_USER}"; then
        log_success "Already configured"
        return 0
    fi

    local -r range=65536
    local -r subuid_entry="${SERVICE_USER}:${SUBUID_START}:${range}"

    log_info "Adding subuid/subgid range: ${SUBUID_START}-$((SUBUID_START + range - 1))"

    if [[ ${DRY_RUN} == true ]]; then
        log_info "[DRY-RUN] Would add to /etc/subuid and /etc/subgid"
    else
        printf '%s\n' "${subuid_entry}" >> /etc/subuid
        printf '%s\n' "${subuid_entry}" >> /etc/subgid
    fi

    log_success "Subordinate IDs configured"
}

create_data_directories() {
    log_step "3/6" "Creating data directories"

    # Note: Using Podman named volumes, but keep /srv/actual for potential future bind mounts
    local -ra directories=(
        "${DATA_DIR}"
    )

    local dir
    for dir in "${directories[@]}"; do
        if [[ -d ${dir} ]]; then
            log_debug "Directory exists: ${dir}"
        else
            execute install -d -m 750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${dir}"
            log_debug "Created: ${dir}"
        fi
    done

    log_success "Data directories ready"
}

enable_linger() {
    log_step "4/6" "Enabling user linger"

    if loginctl show-user "${SERVICE_USER}" -p Linger 2>/dev/null | grep -q "Linger=yes"; then
        log_success "Linger already enabled"
        return 0
    fi

    execute loginctl enable-linger "${SERVICE_USER}"
    log_success "Linger enabled"
}

configure_pasta_networking() {
    log_step "5/6" "Configuring pasta networking"

    local -r config_dir="/home/${SERVICE_USER}/.config/containers"
    local -r config_file="${config_dir}/containers.conf"

    execute install -d -m 755 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${config_dir}"

    if [[ -f ${config_file} ]]; then
        log_info "containers.conf exists (checking pasta config)"
        if grep -q "default_rootless_network_cmd.*pasta" "${config_file}" 2>/dev/null; then
            log_success "Pasta networking already configured"
            return 0
        fi
    fi

    if [[ ${DRY_RUN} == true ]]; then
        log_info "[DRY-RUN] Would create ${config_file}"
    else
        cat > "${config_file}" << 'EOF'
[network]
default_rootless_network_cmd = "pasta"
EOF
        chown "${SERVICE_USER}:${SERVICE_USER}" "${config_file}"
    fi

    log_success "Pasta networking configured"
}

install_quadlet_files() {
    log_step "6/6" "Installing quadlet files"

    local -r quadlet_dir="/home/${SERVICE_USER}/.config/containers/systemd"

    execute install -d -m 755 -o "${SERVICE_USER}" -g "${SERVICE_USER}" \
        "/home/${SERVICE_USER}/.config" \
        "/home/${SERVICE_USER}/.config/containers" \
        "${quadlet_dir}"

    local file
    for file in "${QUADLET_FILES[@]}"; do
        local src="${SCRIPT_DIR}/${file}"
        local dst="${quadlet_dir}/${file}"

        if [[ ! -f ${src} ]]; then
            die "Quadlet file not found: ${src}"
        fi

        execute cp "${src}" "${dst}"
        execute chown "${SERVICE_USER}:${SERVICE_USER}" "${dst}"
        log_debug "Installed: ${dst}"
    done

    # Reload systemd for user
    local -r runtime_dir="/run/user/${SERVICE_UID}"

    if [[ ! -d ${runtime_dir} ]]; then
        execute install -d -m 700 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${runtime_dir}"
    fi

    if [[ ${DRY_RUN} != true ]]; then
        sudo -u "${SERVICE_USER}" XDG_RUNTIME_DIR="${runtime_dir}" \
            systemctl --user daemon-reload
    fi

    log_success "Quadlet files installed"
}

#-------------------------------------------------------------------------------
# Summary
#-------------------------------------------------------------------------------
print_summary() {
    local -r runtime_dir="/run/user/${SERVICE_UID}"

    printf '\n%b═══════════════════════════════════════════════════════════════%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"
    printf '%b                  ACTUAL BUDGET SETUP COMPLETE%b\n' \
        "${COLORS[green]}" "${COLORS[reset]}"
    printf '%b═══════════════════════════════════════════════════════════════%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"

    [[ ${DRY_RUN} == true ]] && log_warn "DRY-RUN MODE: No changes were made"

    printf '\n'
    log_info "Service User:    ${SERVICE_USER} (UID: ${SERVICE_UID})"
    log_info "Home Directory:  /home/${SERVICE_USER}"
    log_info "Data Directory:  ${DATA_DIR}/data"
    log_info "Local Access:    http://127.0.0.1:5006"
    log_info "Public URL:      https://budget.jenkinsameri.com (via Caddy)"

    printf '\n%bNext Steps:%b\n' "${COLORS[bold]}" "${COLORS[reset]}"
    printf '  1. Start service:\n'
    printf '     sudo -u %s XDG_RUNTIME_DIR=%s systemctl --user start actual.service\n\n' \
        "${SERVICE_USER}" "${runtime_dir}"
    printf '  2. Enable auto-start:\n'
    printf '     sudo -u %s XDG_RUNTIME_DIR=%s systemctl --user enable actual.service\n\n' \
        "${SERVICE_USER}" "${runtime_dir}"
}

#-------------------------------------------------------------------------------
# Help
#-------------------------------------------------------------------------------
show_help() {
    cat <<EOF
${SCRIPT_NAME} v${SCRIPT_VERSION} - Actual Budget Rootless Podman Setup

USAGE:
    sudo ${SCRIPT_NAME} [OPTIONS]

OPTIONS:
    --uid UID            Service user UID (default: ${DEFAULT_UID})
    --subuid-start NUM   Starting subordinate UID (default: ${DEFAULT_SUBUID_START})
    --dry-run            Show what would be done
    --verbose, -v        Enable verbose output
    --help, -h           Show this help

EOF
    exit "${EXIT_SUCCESS}"
}

#-------------------------------------------------------------------------------
# Argument Parsing
#-------------------------------------------------------------------------------
parse_arguments() {
    while (($# > 0)); do
        case "$1" in
            --uid)
                [[ -n ${2:-} ]] || die "--uid requires a value"
                SERVICE_UID="$2"
                shift 2
                ;;
            --subuid-start)
                [[ -n ${2:-} ]] || die "--subuid-start requires a value"
                SUBUID_START="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_help
                ;;
            *)
                die "Unknown option: $1" "${EXIT_INVALID_ARGS}"
                ;;
        esac
    done
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------
main() {
    printf '%b═══════════════════════════════════════════════════════════════%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"
    printf '%b  Actual Budget - Rootless Podman Setup v%s%b\n' \
        "${COLORS[blue]}" "${SCRIPT_VERSION}" "${COLORS[reset]}"
    printf '%b═══════════════════════════════════════════════════════════════%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"

    [[ ${DRY_RUN} == true ]] && log_warn "DRY-RUN MODE: No changes will be made"

    check_root
    check_dependencies

    create_service_user
    configure_subordinate_ids
    create_data_directories
    enable_linger
    configure_pasta_networking
    install_quadlet_files

    print_summary
    log_success "Setup completed successfully"
}

parse_arguments "$@"
main
