---
title: "Node.js package.json Script Compatibility - Just Programmer's Manual"
source: "https://just.systems/man/en/nodejs-packagejson-script-compatibility.html"
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

The following export statement gives `just` recipes access to local Node module binaries, and makes `just` recipe commands behave more like `script` entries in Node.js `package.json` files:

```js
export PATH := "./node_modules/.bin:" + env_var('PATH')
```