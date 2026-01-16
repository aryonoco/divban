---
title: "Setting Variables from the Command Line - Just Programmer's Manual"
source: "https://just.systems/man/en/setting-variables-from-the-command-line.html"
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

Variables can be overridden from the command line.

```js
os := "linux"

test: build
  ./test --test {{os}}

build:
  ./build {{os}}
```
```shell
$ just
./build linux
./test --test linux
```

Any number of arguments of the form `NAME=VALUE` can be passed before recipes:

```shell
$ just os=plan9
./build plan9
./test --test plan9
```

Or you can use the `--set` flag:

```shell
$ just --set os bsd
./build bsd
./test --test bsd
```