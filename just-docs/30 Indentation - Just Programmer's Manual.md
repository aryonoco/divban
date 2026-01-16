---
title: "Indentation - Just Programmer's Manual"
source: "https://just.systems/man/en/indentation.html"
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

Recipe lines can be indented with spaces or tabs, but not a mix of both. All of a recipe’s lines must have the same type of indentation, but different recipes in the same `justfile` may use different indentation.

Each recipe must be indented at least one level from the `recipe-name` but after that may be further indented.

Here’s a justfile with a recipe indented with spaces, represented as `·`, and tabs, represented as `→`.

```js
set windows-shell := ["pwsh", "-NoLogo", "-NoProfileLoadTime", "-Command"]

set ignore-comments

list-space directory:
··#!pwsh
··foreach ($item in $(Get-ChildItem {{directory}} )) {
····echo $item.Name
··}
··echo ""

# indentation nesting works even when newlines are escaped
list-tab directory:
→ @foreach ($item in $(Get-ChildItem {{directory}} )) { \
→ → echo $item.Name \
→ }
→ @echo ""
```
```js
PS > just list-space ~
Desktop
Documents
Downloads

PS > just list-tab ~
Desktop
Documents
Downloads
```