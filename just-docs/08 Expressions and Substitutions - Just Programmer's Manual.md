---
title: "Expressions and Substitutions - Just Programmer's Manual"
source: "https://just.systems/man/en/expressions-and-substitutions.html#expressions-and-substitutions"
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

Various operators and function calls are supported in expressions, which may be used in assignments, default recipe arguments, and inside recipe body `{{…}}` substitutions.

```js
tmpdir  := \`mktemp -d\`
version := "0.2.7"
tardir  := tmpdir / "awesomesauce-" + version
tarball := tardir + ".tar.gz"
config  := quote(config_dir() / ".project-config")

publish:
  rm -f {{tarball}}
  mkdir {{tardir}}
  cp README.md *.c {{ config }} {{tardir}}
  tar zcvf {{tarball}} {{tardir}}
  scp {{tarball}} me@server.com:release/
  rm -rf {{tarball}} {{tardir}}
```

The `+` operator returns the left-hand argument concatenated with the right-hand argument:

```js
foobar := 'foo' + 'bar'
```

The logical operators `&&` and `||` can be used to coalesce string values <sup>1.37.0</sup>, similar to Python’s `and` and `or`. These operators consider the empty string `''` to be false, and all other strings to be true.

These operators are currently unstable.

The `&&` operator returns the empty string if the left-hand argument is the empty string, otherwise it returns the right-hand argument:

```js
foo := '' && 'goodbye'      # ''
bar := 'hello' && 'goodbye' # 'goodbye'
```

The `||` operator returns the left-hand argument if it is non-empty, otherwise it returns the right-hand argument:

```js
foo := '' || 'goodbye'      # 'goodbye'
bar := 'hello' || 'goodbye' # 'hello'
```

The `/` operator can be used to join two strings with a slash:

```js
foo := "a" / "b"
```
```js
$ just --evaluate foo
a/b
```

Note that a `/` is added even if one is already present:

```js
foo := "a/"
bar := foo / "b"
```
```js
$ just --evaluate bar
a//b
```

Absolute paths can also be constructed <sup>1.5.0</sup>:

```js
foo := / "b"
```
```js
$ just --evaluate foo
/b
```

The `/` operator uses the `/` character, even on Windows. Thus, using the `/` operator should be avoided with paths that use universal naming convention (UNC), i.e., those that start with `\?`, since forward slashes are not supported with UNC paths.

To write a recipe containing `{{`, use `{{{{`:

```js
braces:
  echo 'I {{{{LOVE}} curly braces!'
```

(An unmatched `}}` is ignored, so it doesn’t need to be escaped.)

Another option is to put all the text you’d like to escape inside of an interpolation:

```js
braces:
  echo '{{'I {{LOVE}} curly braces!'}}'
```

Yet another option is to use `{{ "{{" }}`:

```js
braces:
  echo 'I {{ "{{" }}LOVE}} curly braces!'
```