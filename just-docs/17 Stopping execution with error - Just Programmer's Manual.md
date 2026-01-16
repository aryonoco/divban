---
title: "Stopping execution with error - Just Programmer's Manual"
source: "https://just.systems/man/en/stopping-execution-with-error.html"
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

Execution can be halted with the `error` function. For example:

```js
foo := if "hello" == "goodbye" {
  "xyz"
} else if "a" == "b" {
  "abc"
} else {
  error("123")
}
```

Which produce the following error when run:

```js
error: Call to function \`error\` failed: 123
   |
16 |   error("123")
```