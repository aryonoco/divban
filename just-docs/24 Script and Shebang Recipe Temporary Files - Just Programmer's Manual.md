---
title: "Script and Shebang Recipe Temporary Files - Just Programmer's Manual"
source: "https://just.systems/man/en/script-and-shebang-recipe-temporary-files.html"
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

Both script and shebang recipes write the recipe body to a temporary file for execution. Script recipes execute that file by passing it to a command, while shebang recipes execute the file directly. Shebang recipe execution will fail if the filesystem containing the temporary file is mounted with `noexec` or is otherwise non-executable.

The directory that `just` writes temporary files to may be configured in a number of ways, from highest to lowest precedence:

- Globally with the `--tempdir` command-line option or the `JUST_TEMPDIR` environment variable <sup>1.41.0</sup>.
- On a per-module basis with the `tempdir` setting.
- Globally on Linux with the `XDG_RUNTIME_DIR` environment variable.
- Falling back to the directory returned by [std::env::temp\_dir](https://doc.rust-lang.org/std/env/fn.temp_dir.html).