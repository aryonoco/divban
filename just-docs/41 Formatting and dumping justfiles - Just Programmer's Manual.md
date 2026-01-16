---
title: "Formatting and dumping justfiles - Just Programmer's Manual"
source: "https://just.systems/man/en/formatting-and-dumping-justfiles.html"
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

Each `justfile` has a canonical formatting with respect to whitespace and newlines.

You can overwrite the current justfile with a canonically-formatted version using the currently-unstable `--fmt` flag:

```shell
$ cat justfile
# A lot of blank lines

some-recipe:
  echo "foo"
$ just --fmt --unstable
$ cat justfile
# A lot of blank lines

some-recipe:
    echo "foo"
```

Invoking `just --fmt --check --unstable` runs `--fmt` in check mode. Instead of overwriting the `justfile`, `just` will exit with an exit code of 0 if it is formatted correctly, and will exit with 1 and print a diff if it is not.

You can use the `--dump` command to output a formatted version of the `justfile` to stdout:

```shell
$ just --dump > formatted-justfile
```

The `--dump` command can be used with `--dump-format json` to print a JSON representation of a `justfile`.