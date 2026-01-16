---
title: "Shell Completion Scripts - Just Programmer's Manual"
source: "https://just.systems/man/en/shell-completion-scripts.html"
author:
published:
created: 2026-01-16
description:
tags:
  - "clippings"
---
## Keyboard shortcuts

Press ← or → to navigate between chapters

Press S or / to search in the book

Press ? to show this help

Press Esc to hide this help

Shell completion scripts for Bash, Elvish, Fish, Nushell, PowerShell, and Zsh are available [release archives](https://github.com/casey/just/releases).

The `just` binary can also generate the same completion scripts at runtime using `just --completions SHELL`:

```shell
$ just --completions zsh > just.zsh
```

Please refer to your shell’s documentation for how to install them.

*macOS Note:* Recent versions of macOS use zsh as the default shell. If you use Homebrew to install `just`, it will automatically install the most recent copy of the zsh completion script in the Homebrew zsh directory, which the built-in version of zsh doesn’t know about by default. It’s best to use this copy of the script if possible, since it will be updated whenever you update `just` via Homebrew. Also, many other Homebrew packages use the same location for completion scripts, and the built-in zsh doesn’t know about those either. To take advantage of `just` completion in zsh in this scenario, you can set `fpath` to the Homebrew location before calling `compinit`. Note also that Oh My Zsh runs `compinit` by default. So your `.zshrc` file could look like this:

```bash
# Init Homebrew, which adds environment variables
eval "$(brew shellenv)"

fpath=($HOMEBREW_PREFIX/share/zsh/site-functions $fpath)

# Then choose one of these options:
# 1. If you're using Oh My Zsh, you can initialize it here
# source $ZSH/oh-my-zsh.sh

# 2. Otherwise, run compinit yourself
# autoload -U compinit
# compinit
```