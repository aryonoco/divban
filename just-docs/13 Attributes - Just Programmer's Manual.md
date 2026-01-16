---
title: "Attributes - Just Programmer's Manual"
source: "https://just.systems/man/en/attributes.html"
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

Recipes, `mod` statements, and aliases may be annotated with attributes that change their behavior.

| Name | Type | Description |
| --- | --- | --- |
| `[arg(ARG, help="HELP")]` <sup xmlns="http://www.w3.org/1999/xhtml">1.46.0</sup> | recipe | Print help string `HELP` for `ARG` in usage messages. |
| `[arg(ARG, long="LONG")]` <sup xmlns="http://www.w3.org/1999/xhtml">1.46.0</sup> | recipe | Require values of argument `ARG` to be passed as `--LONG` option. |
| `[arg(ARG, short="S")]` <sup xmlns="http://www.w3.org/1999/xhtml">1.46.0</sup> | recipe | Require values of argument `ARG` to be passed as short `-S` option. |
| `[arg(ARG, value="VALUE")]` <sup xmlns="http://www.w3.org/1999/xhtml">1.46.0</sup> | recipe | Makes option `ARG` a flag which does not take a value. |
| `[arg(ARG, pattern="PATTERN")]` <sup xmlns="http://www.w3.org/1999/xhtml">1.45.0</sup> | recipe | Require values of argument `ARG` to match regular expression `PATTERN`. |
| `[confirm]` <sup xmlns="http://www.w3.org/1999/xhtml">1.17.0</sup> | recipe | Require confirmation prior to executing recipe. |
| `[confirm(PROMPT)]` <sup xmlns="http://www.w3.org/1999/xhtml">1.23.0</sup> | recipe | Require confirmation prior to executing recipe with a custom prompt. |
| `[default]` <sup xmlns="http://www.w3.org/1999/xhtml">1.43.0</sup> | recipe | Use recipe as module’s default recipe. |
| `[doc(DOC)]` <sup xmlns="http://www.w3.org/1999/xhtml">1.27.0</sup> | module, recipe | Set recipe or module’s [documentation comment](https://just.systems/man/en/documentation-comments.html) to `DOC`. |
| `[extension(EXT)]` <sup xmlns="http://www.w3.org/1999/xhtml">1.32.0</sup> | recipe | Set shebang recipe script’s file extension to `EXT`. `EXT` should include a period if one is desired. |
| `[group(NAME)]` <sup xmlns="http://www.w3.org/1999/xhtml">1.27.0</sup> | module, recipe | Put recipe or module in in [group](https://just.systems/man/en/groups.html) `NAME`. |
| `[linux]` <sup xmlns="http://www.w3.org/1999/xhtml">1.8.0</sup> | recipe | Enable recipe on Linux. |
| `[macos]` <sup xmlns="http://www.w3.org/1999/xhtml">1.8.0</sup> | recipe | Enable recipe on MacOS. |
| `[metadata(METADATA)]` <sup xmlns="http://www.w3.org/1999/xhtml">1.42.0</sup> | recipe | Attach `METADATA` to recipe. |
| `[no-cd]` <sup xmlns="http://www.w3.org/1999/xhtml">1.9.0</sup> | recipe | Don’t change directory before executing recipe. |
| `[no-exit-message]` <sup xmlns="http://www.w3.org/1999/xhtml">1.7.0</sup> | recipe | Don’t print an error message if recipe fails. |
| `[no-quiet]` <sup xmlns="http://www.w3.org/1999/xhtml">1.23.0</sup> | recipe | Override globally quiet recipes and always echo out the recipe. |
| `[openbsd]` <sup xmlns="http://www.w3.org/1999/xhtml">1.38.0</sup> | recipe | Enable recipe on OpenBSD. |
| `[parallel]` <sup xmlns="http://www.w3.org/1999/xhtml">1.42.0</sup> | recipe | Run this recipe’s dependencies in parallel. |
| `[positional-arguments]` <sup xmlns="http://www.w3.org/1999/xhtml">1.29.0</sup> | recipe | Turn on [positional arguments](https://just.systems/man/en/avoiding-argument-splitting.html#positional-arguments) for this recipe. |
| `[private]` <sup xmlns="http://www.w3.org/1999/xhtml">1.10.0</sup> | alias, recipe | Make recipe, alias, or variable private. See [Private Recipes](https://just.systems/man/en/private-recipes.html). |
| `[script]` <sup xmlns="http://www.w3.org/1999/xhtml">1.33.0</sup> | recipe | Execute recipe as script. See [script recipes](https://just.systems/man/en/script-recipes.html) for more details. |
| `[script(COMMAND)]` <sup xmlns="http://www.w3.org/1999/xhtml">1.32.0</sup> | recipe | Execute recipe as a script interpreted by `COMMAND`. See [script recipes](https://just.systems/man/en/script-recipes.html) for more details. |
| `[unix]` <sup xmlns="http://www.w3.org/1999/xhtml">1.8.0</sup> | recipe | Enable recipe on Unixes. (Includes MacOS). |
| `[windows]` <sup xmlns="http://www.w3.org/1999/xhtml">1.8.0</sup> | recipe | Enable recipe on Windows. |
| `[working-directory(PATH)]` <sup xmlns="http://www.w3.org/1999/xhtml">1.38.0</sup> | recipe | Set recipe working directory. `PATH` may be relative or absolute. If relative, it is interpreted relative to the default working directory. |

A recipe can have multiple attributes, either on multiple lines:

```js
[no-cd]
[private]
foo:
    echo "foo"
```

Or separated by commas on a single line <sup>1.14.0</sup>:

```js
[no-cd, private]
foo:
    echo "foo"
```

Attributes with a single argument may be written with a colon:

```js
[group: 'bar']
foo:
```

The `[linux]`, `[macos]`, `[unix]`, and `[windows]` attributes are configuration attributes. By default, recipes are always enabled. A recipe with one or more configuration attributes will only be enabled when one or more of those configurations is active.

This can be used to write `justfile` s that behave differently depending on which operating system they run on. The `run` recipe in this `justfile` will compile and run `main.c`, using a different C compiler and using the correct output binary name for that compiler depending on the operating system:

```js
[unix]
run:
  cc main.c
  ./a.out

[windows]
run:
  cl main.c
  main.exe
```

`just` normally executes recipes with the current directory set to the directory that contains the `justfile`. This can be disabled using the `[no-cd]` attribute. This can be used to create recipes which use paths relative to the invocation directory, or which operate on the current directory.

For example, this `commit` recipe:

```js
[no-cd]
commit file:
  git add {{file}}
  git commit
```

Can be used with paths that are relative to the current directory, because `[no-cd]` prevents `just` from changing the current directory when executing `commit`.

`just` normally executes all recipes unless there is an error. The `[confirm]` attribute allows recipes require confirmation in the terminal prior to running. This can be overridden by passing `--yes` to `just`, which will automatically confirm any recipes marked by this attribute.

Recipes dependent on a recipe that requires confirmation will not be run if the relied upon recipe is not confirmed, as well as recipes passed after any recipe that requires confirmation.

```js
[confirm]
delete-all:
  rm -rf *
```

The default confirmation prompt can be overridden with `[confirm(PROMPT)]`:

```js
[confirm("Are you sure you want to delete everything?")]
delete-everything:
  rm -rf *
```