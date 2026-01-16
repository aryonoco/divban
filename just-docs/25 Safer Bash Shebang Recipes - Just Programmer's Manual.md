---
title: "Safer Bash Shebang Recipes - Just Programmer's Manual"
source: "https://just.systems/man/en/safer-bash-shebang-recipes.html"
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

If you’re writing a `bash` shebang recipe, consider adding `set -euxo pipefail`:

```js
foo:
  #!/usr/bin/env bash
  set -euxo pipefail
  hello='Yo'
  echo "$hello from Bash!"
```

It isn’t strictly necessary, but `set -euxo pipefail` turns on a few useful features that make `bash` shebang recipes behave more like normal, linewise `just` recipe:

- `set -e` makes `bash` exit if a command fails.
- `set -u` makes `bash` exit if a variable is undefined.
- `set -x` makes `bash` print each script line before it’s run.
- `set -o pipefail` makes `bash` exit if a command in a pipeline fails. This is `bash` -specific, so isn’t turned on in normal linewise `just` recipes.

Together, these avoid a lot of shell scripting gotchas.

On Windows, shebang interpreter paths containing a `/` are translated from Unix-style paths to Windows-style paths using `cygpath`, a utility that ships with [Cygwin](http://www.cygwin.com/).

For example, to execute this recipe on Windows:

```js
echo:
  #!/bin/sh
  echo "Hello!"
```

The interpreter path `/bin/sh` will be translated to a Windows-style path using `cygpath` before being executed.

If the interpreter path does not contain a `/` it will be executed without being translated. This is useful if `cygpath` is not available, or you wish to pass a Windows-style path to the interpreter.