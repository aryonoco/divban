#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#===============================================================================
# setup-all.sh - Complete Rootless Podman Stack Setup
#
# DESCRIPTION:
#   Orchestrates setup of the complete stack:
#   - Caddy reverse proxy (ports 80/443)
#   - Actual Budget (localhost:5006)
#   - Immich photo management (localhost:2283)
#
#   All services run as isolated rootless containers with dedicated users.
#   Non-interactive and idempotent.
#
# REQUIREMENTS:
#   Bash 5.2+
#   Podman 4.4+ (5.0+ recommended)
#   systemd with user lingering support
#
# USAGE:
#   sudo ./setup-all.sh
#   sudo ./setup-all.sh --dry-run --verbose
#   sudo ./setup-all.sh --install-helpers
#
# OPTIONS:
#   --dry-run           Show what would be done without making changes
#   --verbose, -v       Enable verbose output
#   --install-helpers   Also install service manager scripts to ~/.local/bin
#   --help, -h          Show this help message
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

declare -ri EXIT_SUCCESS=0
declare -ri EXIT_GENERAL_ERROR=1
declare -ri EXIT_INVALID_ARGS=2
declare -ri EXIT_ROOT_REQUIRED=3

#-------------------------------------------------------------------------------
# Global State
#-------------------------------------------------------------------------------
declare DRY_RUN=false
declare VERBOSE=false
declare INSTALL_HELPERS=false

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
log_info()    { printf '%b[INFO]%b  %s\n' "${COLORS[blue]}"   "${COLORS[reset]}" "$1"; }
log_success() { printf '%b[OK]%b    %s\n' "${COLORS[green]}"  "${COLORS[reset]}" "$1"; }
log_warn()    { printf '%b[WARN]%b  %s\n' "${COLORS[yellow]}" "${COLORS[reset]}" "$1" >&2; }
log_error()   { printf '%b[ERROR]%b %s\n' "${COLORS[red]}"    "${COLORS[reset]}" "$1" >&2; }

die() {
    log_error "$1"
    exit "${2:-${EXIT_GENERAL_ERROR}}"
}

#-------------------------------------------------------------------------------
# Validation
#-------------------------------------------------------------------------------
check_root() {
    ((EUID == 0)) || die "This script must be run as root" "${EXIT_ROOT_REQUIRED}"
}

check_podman() {
    if ! command -v podman &>/dev/null; then
        die "Podman not installed"
    fi

    local version
    version=$(podman --version | grep -oP '\d+\.\d+' | head -1)
    log_info "Podman version: ${version}"
}

#-------------------------------------------------------------------------------
# Setup Functions
#-------------------------------------------------------------------------------
run_setup() {
    local -r name="$1"
    local -r script="${SCRIPT_DIR}/${name}/setup.sh"

    printf '\n%b══════════════════════════════════════════════════════════════%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"
    printf '%b  Setting up %s%b\n' "${COLORS[cyan]}" "${name^^}" "${COLORS[reset]}"
    printf '%b══════════════════════════════════════════════════════════════%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"

    if [[ ! -f ${script} ]]; then
        die "Setup script not found: ${script}"
    fi

    local -a args=()
    [[ ${DRY_RUN} == true ]] && args+=(--dry-run)
    [[ ${VERBOSE} == true ]] && args+=(--verbose)

    bash "${script}" "${args[@]}"
}

install_helper_scripts() {
    local -r target_user="${SUDO_USER:-}"

    if [[ -z ${target_user} ]]; then
        log_warn "Cannot determine target user for helper installation"
        log_info "Install manually with: install -m 755 <script> ~/.local/bin/"
        return 0
    fi

    local -r target_home=$(getent passwd "${target_user}" | cut -d: -f6)
    local -r bin_dir="${target_home}/.local/bin"

    log_info "Installing helper scripts to ${bin_dir}..."

    if [[ ${DRY_RUN} == true ]]; then
        log_info "[DRY-RUN] Would install to ${bin_dir}"
        return 0
    fi

    install -d -m 755 -o "${target_user}" -g "${target_user}" "${bin_dir}"

    local -ra helpers=(
        "caddy/caddy-svc.sh:caddy-svc"
        "actual/actual-svc.sh:actual-svc"
        "immich/immich-svc.sh:immich-svc"
    )

    local helper src dst
    for helper in "${helpers[@]}"; do
        src="${SCRIPT_DIR}/${helper%%:*}"
        dst="${bin_dir}/${helper##*:}"

        if [[ -f ${src} ]]; then
            install -m 755 -o "${target_user}" -g "${target_user}" "${src}" "${dst}"
            log_success "Installed: ${dst}"
        else
            log_warn "Not found: ${src}"
        fi
    done

    # Check if ~/.local/bin is in PATH
    if ! sudo -u "${target_user}" bash -c 'echo "$PATH"' | grep -q "${bin_dir}"; then
        log_warn "Add to your shell profile:"
        log_warn "  export PATH=\"\${HOME}/.local/bin:\${PATH}\""
    fi
}

#-------------------------------------------------------------------------------
# Summary
#-------------------------------------------------------------------------------
print_summary() {
    printf '\n%b╔══════════════════════════════════════════════════════════════╗%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"
    printf '%b║                    SETUP COMPLETE                            ║%b\n' \
        "${COLORS[green]}" "${COLORS[reset]}"
    printf '%b╚══════════════════════════════════════════════════════════════╝%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"

    [[ ${DRY_RUN} == true ]] && log_warn "DRY-RUN MODE: No changes were made"

    printf '\n%bService Allocation:%b\n' "${COLORS[bold]}" "${COLORS[reset]}"
    printf '  %-12s %-8s %-20s %s\n' "SERVICE" "UID" "SUBUIDS" "PORT"
    printf '  %-12s %-8s %-20s %s\n' "-------" "---" "-------" "----"
    printf '  %-12s %-8s %-20s %s\n' "caddy"  "1100" "100000-165535" "80, 443"
    printf '  %-12s %-8s %-20s %s\n' "actual" "1101" "200000-265535" "127.0.0.1:5006"
    printf '  %-12s %-8s %-20s %s\n' "immich" "1102" "300000-365535" "127.0.0.1:2283"

    printf '\n%bNext Steps:%b\n' "${COLORS[bold]}" "${COLORS[reset]}"
    cat <<'EOF'
  1. Edit Caddyfile with your domains:
     sudo nano /srv/caddy/Caddyfile

  2. Start all services:
     caddy-svc start
     actual-svc start
     immich-svc start

  3. Enable auto-start on boot:
     caddy-svc enable
     actual-svc enable
     immich-svc enable

  4. Check status:
     caddy-svc status
     actual-svc status
     immich-svc status

EOF

    printf '%bPublic URLs (after DNS configured):%b\n' "${COLORS[bold]}" "${COLORS[reset]}"
    printf '  https://budget.jenkinsameri.com  → Actual Budget\n'
    printf '  https://photos.jenkinsameri.com  → Immich\n'
    printf '\n'
}

#-------------------------------------------------------------------------------
# Help
#-------------------------------------------------------------------------------
show_help() {
    cat <<EOF
${SCRIPT_NAME} v${SCRIPT_VERSION} - Complete Rootless Podman Stack Setup

USAGE:
    sudo ${SCRIPT_NAME} [OPTIONS]

OPTIONS:
    --dry-run           Show what would be done
    --verbose, -v       Enable verbose output
    --install-helpers   Install service manager scripts to ~/.local/bin
    --help, -h          Show this help

COMPONENTS:
    Caddy   - Reverse proxy with automatic TLS (ports 80, 443)
    Actual  - Personal finance manager (localhost:5006)
    Immich  - Photo/video management (localhost:2283)

EXAMPLES:
    sudo ${SCRIPT_NAME}
    sudo ${SCRIPT_NAME} --dry-run --verbose
    sudo ${SCRIPT_NAME} --install-helpers

EOF
    exit "${EXIT_SUCCESS}"
}

#-------------------------------------------------------------------------------
# Argument Parsing
#-------------------------------------------------------------------------------
parse_arguments() {
    while (($# > 0)); do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --install-helpers)
                INSTALL_HELPERS=true
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
    printf '%b╔══════════════════════════════════════════════════════════════╗%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"
    printf '%b║     Rootless Podman Stack Setup v%s                       ║%b\n' \
        "${COLORS[blue]}" "${SCRIPT_VERSION}" "${COLORS[reset]}"
    printf '%b║     Caddy • Actual Budget • Immich                          ║%b\n' \
        "${COLORS[blue]}" "${COLORS[reset]}"
    printf '%b╚══════════════════════════════════════════════════════════════╝%b\n' \
        "${COLORS[bold]}" "${COLORS[reset]}"

    [[ ${DRY_RUN} == true ]] && log_warn "DRY-RUN MODE: No changes will be made"

    check_root
    check_podman

    # Run individual setups
    run_setup caddy
    run_setup actual
    run_setup immich

    # Install helper scripts
    if [[ ${INSTALL_HELPERS} == true ]]; then
        printf '\n%b══════════════════════════════════════════════════════════════%b\n' \
            "${COLORS[bold]}" "${COLORS[reset]}"
        printf '%b  Installing helper scripts%b\n' "${COLORS[cyan]}" "${COLORS[reset]}"
        printf '%b══════════════════════════════════════════════════════════════%b\n' \
            "${COLORS[bold]}" "${COLORS[reset]}"
        install_helper_scripts
    fi

    print_summary
    log_success "All setups completed successfully"
}

parse_arguments "$@"
main
