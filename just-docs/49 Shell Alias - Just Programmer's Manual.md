---
title: "Shell Alias - Just Programmer's Manual"
source: "https://just.systems/man/en/shell-alias.html"
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

For lightning-fast command running, put `alias j=just` in your shell’s configuration file.

In `bash`, the aliased command may not keep the shell completion functionality described in the next section. Add the following line to your `.bashrc` to use the same completion function as `just` for your aliased command:

```shell
complete -F _just -o bashdefault -o default j
```