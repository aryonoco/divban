---
title: "Changing the Working Directory in a Recipe - Just Programmer's Manual"
source: "https://just.systems/man/en/changing-the-working-directory-in-a-recipe.html"
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

Each recipe line is executed by a new shell, so if you change the working directory on one line, it won’t have an effect on later lines:

```js
foo:
  pwd    # This \`pwd\` will print the same directory…
  cd bar
  pwd    # …as this \`pwd\`!
```

There are a couple ways around this. One is to call `cd` on the same line as the command you want to run:

```js
foo:
  cd bar && pwd
```

The other is to use a shebang recipe. Shebang recipe bodies are extracted and run as scripts, so a single shell instance will run the whole thing, and thus a `cd` on one line will affect later lines, just like a shell script:

```js
foo:
  #!/usr/bin/env bash
  set -euxo pipefail
  cd bar
  pwd
```