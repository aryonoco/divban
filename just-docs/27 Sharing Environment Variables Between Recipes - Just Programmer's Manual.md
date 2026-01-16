---
title: "Sharing Environment Variables Between Recipes - Just Programmer's Manual"
source: "https://just.systems/man/en/sharing-environment-variables-between-recipes.html"
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

Each line of each recipe is executed by a fresh shell, so it is not possible to share environment variables between recipes.

Some tools, like [Python’s venv](https://docs.python.org/3/library/venv.html), require loading environment variables in order to work, making them challenging to use with `just`. As a workaround, you can execute the virtual environment binaries directly:

```js
venv:
  [ -d foo ] || python3 -m venv foo

run: venv
  ./foo/bin/python3 main.py
```