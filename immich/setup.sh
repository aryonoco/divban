#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#===============================================================================
# setup.sh - Immich Photo Management Rootless Podman Setup
#
# DESCRIPTION:
#   Installs Immich as rootless Podman quadlets with dedicated service user.
#   Includes PostgreSQL (pgvector), Redis, Machine Learning, and Server.
#   Binds to localhost only for reverse proxy access via Caddy.
#   Non-interactive and idempotent.
#
# REQUIREMENTS:
#   Bash 5.2+
#   Podman 4.4+ (5.0+ recommended)
#   systemd with user lingering support
#   ~15GB free for initial image/model downloads
#
# USAGE:
#   sudo ./setup.sh
#   sudo ./setup.sh --dry-run --verbose
#   sudo ./setup.sh --uid 1102 --subuid-start 300000
#
# OPTIONS:
#   --uid UID            Service user UID (default: 1102)
#   --subuid-start NUM   Starting subordinate UID (default: 300000)
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

declare -r SERVICE_USER="immich"
declare -ri DEFAULT_UID=1102
declare -ri DEFAULT_SUBUID_START=300000
declare -r DATA_DIR="/srv/immich"

declare -ri EXIT_SUCCESS=0
declare -ri EXIT_GENERAL_ERROR=1
declare -ri EXIT_INVALID_ARGS=2
declare -ri EXIT_ROOT_REQUIRED=3
declare -ri EXIT_DEPENDENCY_MISSING=4

declare -ra REQUIRED_COMMANDS=(
    podman systemctl loginctl useradd getent mkdir cp chmod chown
    install openssl sed
)

declare -ra QUADLET_FILES=(
    immich.network
    immich-upload.volume
    immich-postgres-data.volume
    immich-model-cache.volume
    immich-redis.container
    immich-postgres.container
    immich-machine-learning.container
    immich-server.container
)

#-------------------------------------------------------------------------------
# Global State
#-------------------------------------------------------------------------------
declare -i SERVICE_UID="${IMMICH_UID:-${DEFAULT_UID}}"
declare -i SUBUID_START="${IMMICH_SUBUID_START:-${DEFAULT_SUBUID_START}}"
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

generate_password() {
    openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32
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
    log_step "1/7" "Creating service user"

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
        --comment "Immich Photo Service" \
        "${SERVICE_USER}"

    log_success "User created"
}

configure_subordinate_ids() {
    log_step "2/7" "Configuring subordinate UIDs/GIDs"

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
    log_step "3/7" "Creating data directories"

    # Note: Using Podman named volumes for upload and postgres data
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
    log_step "4/7" "Enabling user linger"

    if loginctl show-user "${SERVICE_USER}" -p Linger 2>/dev/null | grep -q "Linger=yes"; then
        log_success "Linger already enabled"
        return 0
    fi

    execute loginctl enable-linger "${SERVICE_USER}"
    log_success "Linger enabled"
}

configure_pasta_networking() {
    log_step "5/7" "Configuring pasta networking"

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
    log_step "6/7" "Installing quadlet files"

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

    log_success "Quadlet files installed"
}

create_environment_file() {
    log_step "7/7" "Creating environment file"

    local -r env_file="/home/${SERVICE_USER}/.config/containers/systemd/immich.env"

    if [[ -f ${env_file} ]]; then
        log_info "Environment file exists (not overwriting)"
        return 0
    fi

    local db_password
    db_password=$(generate_password)

    if [[ ${DRY_RUN} == true ]]; then
        log_info "[DRY-RUN] Would create ${env_file}"
    else
        cp "${SCRIPT_DIR}/immich.env.example" "${env_file}"
        sed -i "s/CHANGE_THIS_PASSWORD/${db_password}/g" "${env_file}"
        chown "${SERVICE_USER}:${SERVICE_USER}" "${env_file}"
        chmod 600 "${env_file}"
    fi

    log_success "Environment file created with generated password"

    # Reload systemd for user
    local -r runtime_dir="/run/user/${SERVICE_UID}"

    if [[ ! -d ${runtime_dir} ]]; then
        execute install -d -m 700 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${runtime_dir}"
    fi

    if [[ ${DRY_RUN} != true ]]; then
        sudo -u "${SERVICE_USER}" XDG_RUNTIME_DIR="${runtime_dir}" \
            systemctl --user daemon-reload
    fi
}

#-------------------------------------------------------------------------------
# Summary
#-------------------------------------------------------------------------------
print_summary() {
    local -r runtime_dir="/run/user/${SERVICE_UID}"

    printf '\n%b═══════════════════════════════════════════════════════════════%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"
    printf '%b                     IMMICH SETUP COMPLETE%b\n' \
        "${COLORS[green]}" "${COLORS[reset]}"
    printf '%b═══════════════════════════════════════════════════════════════%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"

    [[ ${DRY_RUN} == true ]] && log_warn "DRY-RUN MODE: No changes were made"

    printf '\n'
    log_info "Service User:    ${SERVICE_USER} (UID: ${SERVICE_UID})"
    log_info "Home Directory:  /home/${SERVICE_USER}"
    log_info "Data Volumes:    immich-upload, immich-postgres-data, immich-model-cache"
    log_info "Local Access:    http://127.0.0.1:2283"
    log_info "Public URL:      https://photos.jenkinsameri.com (via Caddy)"

    printf '\n%bNext Steps:%b\n' "${COLORS[bold]}" "${COLORS[reset]}"
    printf '  1. Start services:\n'
    printf '     sudo -u %s XDG_RUNTIME_DIR=%s systemctl --user start immich-server.service\n\n' \
        "${SERVICE_USER}" "${runtime_dir}"
    printf '  2. Enable auto-start:\n'
    printf '     sudo -u %s XDG_RUNTIME_DIR=%s systemctl --user enable immich-server.service\n' \
        "${SERVICE_USER}" "${runtime_dir}"
    printf '     sudo -u %s XDG_RUNTIME_DIR=%s systemctl --user enable immich-machine-learning.service\n\n' \
        "${SERVICE_USER}" "${runtime_dir}"

    log_warn "First start downloads ~15GB of images/models. Allow 10-20 minutes."
}

#-------------------------------------------------------------------------------
# Help
#-------------------------------------------------------------------------------
show_help() {
    cat <<EOF
${SCRIPT_NAME} v${SCRIPT_VERSION} - Immich Rootless Podman Setup

USAGE:
    sudo ${SCRIPT_NAME} [OPTIONS]

OPTIONS:
    --uid UID            Service user UID (default: ${DEFAULT_UID})
    --subuid-start NUM   Starting subordinate UID (default: ${DEFAULT_SUBUID_START})
    --dry-run            Show what would be done
    --verbose, -v        Enable verbose output
    --help, -h           Show this help

COMPONENTS:
    - PostgreSQL with pgvector (AI embeddings)
    - Redis/Valkey (caching)
    - Machine Learning (face recognition, search)
    - Server (web UI, API)

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
    printf '%b  Immich Photo Management - Rootless Podman Setup v%s%b\n' \
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
    create_environment_file

    print_summary
    log_success "Setup completed successfully"
}

parse_arguments "$@"
main
