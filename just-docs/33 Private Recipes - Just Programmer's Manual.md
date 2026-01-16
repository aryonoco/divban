---
title: "Private Recipes - Just Programmer's Manual"
source: "https://just.systems/man/en/private-recipes.html"
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

Recipes and aliases whose name starts with a `_` are omitted from `just --list`:

```js
test: _test-helper
  ./bin/test

_test-helper:
  ./bin/super-secret-test-helper-stuff
```
```shell
$ just --list
Available recipes:
    test
```

And from `just --summary`:

```shell
$ just --summary
test
```

The `[private]` attribute <sup>1.10.0</sup> may also be used to hide recipes or aliases without needing to change the name:

```js
[private]
foo:

[private]
alias b := bar

bar:
```
```shell
$ just --list
Available recipes:
    bar
```

This is useful for helper recipes which are only meant to be used as dependencies of other recipes.