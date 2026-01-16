---
title: 03 Invoking Multiple Recipes - Just Programmer's Manual
source: https://just.systems/man/en/invoking-multiple-recipes.html
author:
published:
created: 2026-01-16
description:
tags:
  - clippings
---
## Keyboard shortcuts

Press ← or → to navigate between chapters

Press S or / to search in the book

Press ? to show this help

Press Esc to hide this help

Multiple recipes may be invoked on the command line at once:

```js
build:
  make web

serve:
  python3 -m http.server -d out 8000
```
```shell
$ just build serve
make web
python3 -m http.server -d out 8000
```

Keep in mind that recipes with parameters will swallow arguments, even if they match the names of other recipes:

```js
build project:
  make {{project}}

serve:
  python3 -m http.server -d out 8000
```
```shell
$ just build serve
make: *** No rule to make target \`serve'.  Stop.
```

The `--one` flag can be used to restrict command-line invocations to a single recipe:

```shell
$ just --one build serve
error: Expected 1 command-line recipe invocation but found 2.
```