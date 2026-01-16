---
title: "Python Recipes with uv - Just Programmer's Manual"
source: "https://just.systems/man/en/python-recipes-with-uv.html"
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

[`uv`](https://github.com/astral-sh/uv) is an excellent cross-platform python project manager, written in Rust.

Using the `[script]` attribute and `script-interpreter` setting, `just` can easily be configured to run Python recipes with `uv`:

```js
set unstable

set script-interpreter := ['uv', 'run', '--script']

[script]
hello:
  print("Hello from Python!")

[script]
goodbye:
  # /// script
  # requires-python = ">=3.11"
  # dependencies=["sh"]
  # ///
  import sh
  print(sh.echo("Goodbye from Python!"), end='')
```

Of course, a shebang also works:

```js
hello:
  #!/usr/bin/env -S uv run --script
  print("Hello from Python!")
```