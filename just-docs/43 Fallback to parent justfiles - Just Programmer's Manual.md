---
title: "Fallback to parent justfiles - Just Programmer's Manual"
source: "https://just.systems/man/en/fallback-to-parent-justfiles.html"
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

If a recipe is not found in a `justfile` and the `fallback` setting is set,`just` will look for `justfile` s in the parent directory and up, until it reaches the root directory. `just` will stop after it reaches a `justfile` in which the `fallback` setting is `false` or unset.

As an example, suppose the current directory contains this `justfile`:

```js
set fallback
foo:
  echo foo
```

And the parent directory contains this `justfile`:

```js
bar:
  echo bar
```
```shell
$ just bar
Trying ../justfile
echo bar
bar
```