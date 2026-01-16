---
title: "Ignoring Errors - Just Programmer's Manual"
source: "https://just.systems/man/en/ignoring-errors.html"
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

Normally, if a command returns a non-zero exit status, execution will stop. To continue execution after a command, even if it fails, prefix the command with `-`:

```js
foo:
  -cat foo
  echo 'Done!'
```
```shell
$ just foo
cat foo
cat: foo: No such file or directory
echo 'Done!'
Done!
```