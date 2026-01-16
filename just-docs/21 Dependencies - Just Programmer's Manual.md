---
title: "Dependencies - Just Programmer's Manual"
source: "https://just.systems/man/en/dependencies.html"
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

Dependencies run before recipes that depend on them:

```js
a: b
  @echo A

b:
  @echo B
```
```js
$ just a
B
A
```

In a given invocation of `just`, a recipe with the same arguments will only run once, regardless of how many times it appears in the command-line invocation, or how many times it appears as a dependency:

```js
a:
  @echo A

b: a
  @echo B

c: a
  @echo C
```
```js
$ just a a a a a
A
$ just b c
A
B
C
```

Multiple recipes may depend on a recipe that performs some kind of setup, and when those recipes run, that setup will only be performed once:

```js
build:
  cc main.c

test-foo: build
  ./a.out --test foo

test-bar: build
  ./a.out --test bar
```
```js
$ just test-foo test-bar
cc main.c
./a.out --test foo
./a.out --test bar
```

Recipes in a given run are only skipped when they receive the same arguments:

```js
build:
  cc main.c

test TEST: build
  ./a.out --test {{TEST}}
```
```js
$ just test foo test bar
cc main.c
./a.out --test foo
./a.out --test bar
```

Normal dependencies of a recipes always run before a recipe starts. That is to say, the dependee always runs before the depender. These dependencies are called “prior dependencies”.

A recipe can also have subsequent dependencies, which run immediately after the recipe and are introduced with an `&&`:

```js
a:
  echo 'A!'

b: a && c d
  echo 'B!'

c:
  echo 'C!'

d:
  echo 'D!'
```

…running *b* prints:

```shell
$ just b
echo 'A!'
A!
echo 'B!'
B!
echo 'C!'
C!
echo 'D!'
D!
```

`just` doesn’t support running recipes in the middle of another recipe, but you can call `just` recursively in the middle of a recipe. Given the following `justfile`:

```js
a:
  echo 'A!'

b: a
  echo 'B start!'
  just c
  echo 'B end!'

c:
  echo 'C!'
```

…running *b* prints:

```shell
$ just b
echo 'A!'
A!
echo 'B start!'
B start!
echo 'C!'
C!
echo 'B end!'
B end!
```

This has limitations, since recipe `c` is run with an entirely new invocation of `just`: Assignments will be recalculated, dependencies might run twice, and command line arguments will not be propagated to the child `just` process.