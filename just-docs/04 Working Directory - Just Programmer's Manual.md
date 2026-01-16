---
title: "Working Directory - Just Programmer's Manual"
source: "https://just.systems/man/en/working-directory.html"
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

By default, recipes run with the working directory set to the directory that contains the `justfile`.

The `[no-cd]` attribute can be used to make recipes run with the working directory set to directory in which `just` was invoked.

```js
@foo:
  pwd

[no-cd]
@bar:
  pwd
```
```shell
$ cd subdir
$ just foo
/
$ just bar
/subdir
```

You can override the working directory for all recipes with `set working-directory := '…'`:

```js
set working-directory := 'bar'

@foo:
  pwd
```
```shell
$ pwd
/home/bob
$ just foo
/home/bob/bar
```

You can override the working directory for a specific recipe with the `working-directory` attribute <sup>1.38.0</sup>:

```js
[working-directory: 'bar']
@foo:
  pwd
```
```shell
$ pwd
/home/bob
$ just foo
/home/bob/bar
```

The argument to the `working-directory` setting or `working-directory` attribute may be absolute or relative. If it is relative it is interpreted relative to the default working directory.