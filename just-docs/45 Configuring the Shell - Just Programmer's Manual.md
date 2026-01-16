---
title: "Configuring the Shell - Just Programmer's Manual"
source: "https://just.systems/man/en/configuring-the-shell.html"
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

There are a number of ways to configure the shell for linewise recipes, which are the default when a recipe does not start with a `#!` shebang. Their precedence, from highest to lowest, is:

1. The `--shell` and `--shell-arg` command line options. Passing either of these will cause `just` to ignore any settings in the current justfile.
2. `set windows-shell := [...]`
3. `set windows-powershell` (deprecated)
4. `set shell := [...]`

Since `set windows-shell` has higher precedence than `set shell`, you can use `set windows-shell` to pick a shell on Windows, and `set shell` to pick a shell for all other platforms.