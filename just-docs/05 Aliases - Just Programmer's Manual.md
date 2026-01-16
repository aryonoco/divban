---
title: "Aliases - Just Programmer's Manual"
source: "https://just.systems/man/en/aliases.html"
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

Aliases allow recipes to be invoked on the command line with alternative names:

```js
alias b := build

build:
  echo 'Building!'
```
```shell
$ just b
echo 'Building!'
Building!
```

The target of an alias may be a recipe in a submodule:

```js
mod foo

alias baz := foo::bar
```