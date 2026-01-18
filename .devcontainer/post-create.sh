#!/usr/bin/env bash
# SPDX-License-Identifier: 0BSD
# SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
#
# =============================================================================
# divban Development Container Post-Create Script
# Sets up Antidote, Powerlevel10k, and project dependencies
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANTIDOTE_DIR="${HOME}/.antidote"
ANTIDOTE_REPO="https://github.com/mattmc3/antidote.git"

echo ""
echo "============================================"
echo "  divban Development Container Setup"
echo "============================================"
echo ""

# =============================================================================
# 1. Install Antidote Plugin Manager
# =============================================================================
echo "[1/7] Installing Antidote plugin manager..."

if [[ ! -d "${ANTIDOTE_DIR}" ]]; then
    git clone --depth=1 "${ANTIDOTE_REPO}" "${ANTIDOTE_DIR}"
    echo "  OK: Antidote installed"
else
    echo "  OK: Antidote already installed"
fi

# =============================================================================
# 2. Copy Configuration Files
# =============================================================================
echo "[2/7] Copying configuration files..."

# Copy zsh_plugins.txt
cp "${SCRIPT_DIR}/zsh_plugins.txt" "${HOME}/.zsh_plugins.txt"
echo "  OK: .zsh_plugins.txt"

# Copy p10k.zsh configuration
cp "${SCRIPT_DIR}/p10k.zsh" "${HOME}/.p10k.zsh"
echo "  OK: .p10k.zsh"

# =============================================================================
# 3. Create .zshrc
# =============================================================================
echo "[3/7] Creating .zshrc..."

cat > "${HOME}/.zshrc" << 'ZSHRC_EOF'
# Powerlevel10k instant prompt (must stay at top)
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

#=============================================================================
# Antidote Plugin Manager
#=============================================================================
source "${ZDOTDIR:-$HOME}/.antidote/antidote.zsh"
antidote load

#=============================================================================
# Plugin Configuration
#=============================================================================
ZSH_AUTOSUGGEST_STRATEGY=(history completion)
ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=20
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#666666"
ZSH_AUTOSUGGEST_USE_ASYNC=1

ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)
ZSH_HIGHLIGHT_MAXLENGTH=512

export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --border --info=inline"
if command -v fdfind &>/dev/null; then
  export FZF_DEFAULT_COMMAND="fdfind --type f --hidden --follow --exclude .git"
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  export FZF_ALT_C_COMMAND="fdfind --type d --hidden --follow --exclude .git"
fi

export ZSHZ_DATA="${HOME}/.z"

#=============================================================================
# User Configuration
#=============================================================================
export EDITOR='vim'
export VISUAL='vim'

HISTSIZE=500000
SAVEHIST=500000
setopt HIST_IGNORE_ALL_DUPS HIST_SAVE_NO_DUPS SHARE_HISTORY AUTO_CD AUTO_PUSHD

#=============================================================================
# Aliases
#=============================================================================
# Just command runner
alias j='just'
alias jls='just --list'

# Bun shortcuts
alias bb='bun run build'
alias bba='bun run build:all'
alias bd='bun run dev'
alias bt='bun test'
alias btw='bun test --watch'
alias btc='bun test --coverage'
alias bl='bun run lint'
alias bf='bun run format'
alias btc='bun run typecheck'

# Debian CLI aliases (fd-find, batcat)
alias fd='fdfind'
alias bat='batcat'

# Modern ls/tree (eza)
alias ls='eza'
alias ll='eza -la --git'
alias la='eza -a'
alias lt='eza --tree'

#=============================================================================
# Powerlevel10k Configuration
#=============================================================================
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
ZSHRC_EOF

echo "  OK: .zshrc created"

# =============================================================================
# 4. Create .bashrc
# =============================================================================
echo "[4/7] Creating .bashrc..."

cat > "${HOME}/.bashrc" << 'BASHRC_EOF'
#=============================================================================
# divban Development Container - Bash Configuration
#=============================================================================

# Default editor
export EDITOR='vim'
export VISUAL='vim'

# History settings
HISTSIZE=500000
HISTFILESIZE=500000
HISTCONTROL=ignoreboth:erasedups
shopt -s histappend

# Shell options
shopt -s checkwinsize
shopt -s autocd 2>/dev/null

# Prompt
PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '

# Aliases
alias j='just'
alias jls='just --list'
alias bb='bun run build'
alias bd='bun run dev'
alias bt='bun test'
alias bl='bun run lint'
alias bf='bun run format'
alias fd='fdfind'
alias bat='batcat'

# Modern ls/tree (eza)
alias ls='eza'
alias ll='eza -la --git'
alias la='eza -a'
alias lt='eza --tree'

# FZF
export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --border --info=inline"
if command -v fdfind &>/dev/null; then
  export FZF_DEFAULT_COMMAND="fdfind --type f --hidden --follow --exclude .git"
fi
[ -f /usr/share/doc/fzf/examples/key-bindings.bash ] && source /usr/share/doc/fzf/examples/key-bindings.bash
BASHRC_EOF

echo "  OK: .bashrc created"

# =============================================================================
# 5. Pre-cache Antidote Plugins
# =============================================================================
echo "[5/7] Pre-caching Antidote plugins (this may take a moment)..."

mkdir -p "${HOME}/.cache/antidote"

# Generate static plugin file
zsh -c "
  source '${ANTIDOTE_DIR}/antidote.zsh'
  antidote bundle < '${HOME}/.zsh_plugins.txt' > '${HOME}/.zsh_plugins.zsh'
" 2>/dev/null || echo "  WARN: Plugin pre-cache had issues (will retry on first shell)"

echo "  OK: Plugins pre-cached"

# =============================================================================
# 6. Install Project Dependencies
# =============================================================================
echo "[6/7] Installing project dependencies..."

cd /workspaces/divban
bun install
echo "  OK: Dependencies installed"

# =============================================================================
# 7. Start Podman Socket
# =============================================================================
echo "[7/7] Starting Podman user socket..."

# Start Podman API socket for Pod Manager extension
# Use XDG_RUNTIME_DIR if set, otherwise use a user-writable fallback
PODMAN_SOCKET_DIR="${XDG_RUNTIME_DIR:-${HOME}/.local/run}/podman"
mkdir -p "${PODMAN_SOCKET_DIR}"

if podman system service --time=0 "unix://${PODMAN_SOCKET_DIR}/podman.sock" &>/dev/null & then
    disown
    echo "  OK: Podman socket started at ${PODMAN_SOCKET_DIR}/podman.sock"
else
    echo "  WARN: Could not start Podman socket (non-fatal)"
fi

# Verify Podman works
if podman --version &>/dev/null; then
    echo "  Podman: $(podman --version)"
else
    echo "  WARN: Podman not responding"
fi

# =============================================================================
# Version Validation
# =============================================================================
echo ""
echo "Validating versions..."

if [[ -f versions.env ]]; then
    source versions.env
    MISMATCH=0

    INSTALLED_BUN=$(bun --version 2>/dev/null || echo "unknown")
    echo "  Bun: expected=${BUN_VERSION}, installed=${INSTALLED_BUN}"
    [[ "${BUN_VERSION}" != "${INSTALLED_BUN}" ]] && MISMATCH=1

    if [[ ${MISMATCH} -eq 1 ]]; then
        echo ""
        echo "WARNING: Version mismatch! Update .devcontainer/devcontainer.json and rebuild."
    else
        echo "  OK: All versions match"
    fi
else
    echo "  SKIP: versions.env not found"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "Quick start:"
echo "  just          # Show available commands"
echo "  just test     # Run tests"
echo "  just ci       # Run full CI pipeline"
echo ""
echo "Shell features:"
echo "  Ctrl+R        # fzf history search"
echo "  Ctrl+T        # fzf file search"
echo "  Alt+C         # fzf directory jump"
echo "  ESC ESC       # prefix command with sudo"
echo ""
