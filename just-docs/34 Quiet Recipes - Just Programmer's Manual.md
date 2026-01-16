---
title: "Quiet Recipes - Just Programmer's Manual"
source: "https://just.systems/man/en/quiet-recipes.html"
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

A recipe name may be prefixed with `@` to invert the meaning of `@` before each line:

```js
@quiet:
  echo hello
  echo goodbye
  @# all done!
```

Now only the lines starting with `@` will be echoed:

```shell
$ just quiet
hello
goodbye
# all done!
```

All recipes in a Justfile can be made quiet with `set quiet`:

```js
set quiet

foo:
  echo "This is quiet"

@foo2:
  echo "This is also quiet"
```

The `[no-quiet]` attribute overrides this setting:

```js
set quiet

foo:
  echo "This is quiet"

[no-quiet]
foo2:
  echo "This is not quiet"
```

Shebang recipes are quiet by default:

```js
foo:
  #!/usr/bin/env bash
  echo 'Foo!'
```
```shell
$ just foo
Foo!
```

Adding `@` to a shebang recipe name makes `just` print the recipe before executing it:

```js
@bar:
  #!/usr/bin/env bash
  echo 'Bar!'
```
```shell
$ just bar
#!/usr/bin/env bash
echo 'Bar!'
Bar!
```

`just` normally prints error messages when a recipe line fails. These error messages can be suppressed using the `[no-exit-message]` <sup>1.7.0</sup> attribute. You may find this especially useful with a recipe that wraps a tool:

```js
git *args:
    @git {{args}}
```
```shell
$ just git status
fatal: not a git repository (or any of the parent directories): .git
error: Recipe \`git\` failed on line 2 with exit code 128
```

Add the attribute to suppress the exit error message when the tool exits with a non-zero code:

```js
[no-exit-message]
git *args:
    @git {{args}}
```
```shell
$ just git status
fatal: not a git repository (or any of the parent directories): .git
```