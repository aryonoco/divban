---
title: "Re-running recipes when files change - Just Programmer's Manual"
source: "https://just.systems/man/en/re-running-recipes-when-files-change.html"
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

[`watchexec`](https://github.com/mattgreen/watchexec) can re-run any command when files change.

To re-run the recipe `foo` when any file changes:

```shell
watchexec just foo
```

See `watchexec --help` for more info, including how to specify which files should be watched for changes.