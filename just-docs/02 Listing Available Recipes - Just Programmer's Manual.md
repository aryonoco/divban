---
title: "Listing Available Recipes - Just Programmer's Manual"
source: "https://just.systems/man/en/listing-available-recipes.html"
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

Recipes can be listed in alphabetical order with `just --list`:

```shell
$ just --list
Available recipes:
    build
    test
    deploy
    lint
```

Recipes in [submodules](https://just.systems/man/en/modules1190.html) can be listed with `just --list PATH`, where `PATH` is a space- or `::`\-separated module path:

```js
$ cat justfile
mod foo
$ cat foo.just
mod bar
$ cat bar.just
baz:
$ just --list foo bar
Available recipes:
    baz
$ just --list foo::bar
Available recipes:
    baz
```

`just --summary` is more concise:

```shell
$ just --summary
build test deploy lint
```

Pass `--unsorted` to print recipes in the order they appear in the `justfile`:

```js
test:
  echo 'Testing!'

build:
  echo 'Building!'
```
```shell
$ just --list --unsorted
Available recipes:
    test
    build
```
```shell
$ just --summary --unsorted
test build
```

If you’d like `just` to default to listing the recipes in the `justfile`, you can use this as your default recipe:

```js
default:
  @just --list
```

Note that you may need to add `--justfile {{justfile()}}` to the line above. Without it, if you executed `just -f /some/distant/justfile -d .` or `just -f ./non-standard-justfile`, the plain `just --list` inside the recipe would not necessarily use the file you provided. It would try to find a justfile in your current path, maybe even resulting in a `No justfile found` error.

The heading text can be customized with `--list-heading`:

```shell
$ just --list --list-heading $'Cool stuff…\n'
Cool stuff…
    test
    build
```

And the indentation can be customized with `--list-prefix`:

```shell
$ just --list --list-prefix ····
Available recipes:
····test
····build
```

The argument to `--list-heading` replaces both the heading and the newline following it, so it should contain a newline if non-empty. It works this way so you can suppress the heading line entirely by passing the empty string:

```shell
$ just --list --list-heading ''
    test
    build
```