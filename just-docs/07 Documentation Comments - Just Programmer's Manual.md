---
title: "Documentation Comments - Just Programmer's Manual"
source: "https://just.systems/man/en/documentation-comments.html"
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

Comments immediately preceding a recipe will appear in `just --list`:

```js
# build stuff
build:
  ./bin/build

# test stuff
test:
  ./bin/test
```
```shell
$ just --list
Available recipes:
    build # build stuff
    test # test stuff
```

The `[doc]` attribute can be used to set or suppress a recipe’s doc comment:

```js
# This comment won't appear
[doc('Build stuff')]
build:
  ./bin/build

# This one won't either
[doc]
test:
  ./bin/test
```
```shell
$ just --list
Available recipes:
    build # Build stuff
    test
```