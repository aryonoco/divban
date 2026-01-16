---
title: "Remote Justfiles - Just Programmer's Manual"
source: "https://just.systems/man/en/remote-justfiles.html"
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

If you wish to include a `mod` or `import` source file in many `justfiles` without needing to duplicate it, you can use an optional `mod` or `import`, along with a recipe to fetch the module source:

```js
import? 'foo.just'

fetch:
  curl https://raw.githubusercontent.com/casey/just/master/justfile > foo.just
```

Given the above `justfile`, after running `just fetch`, the recipes in `foo.just` will be available.