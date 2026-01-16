---
title: "Command Evaluation Using Backticks - Just Programmer's Manual"
source: "https://just.systems/man/en/command-evaluation-using-backticks.html"
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

Backticks can be used to store the result of commands:

```js
localhost := \`dumpinterfaces | cut -d: -f2 | sed 's/\/.*//' | sed 's/ //g'\`

serve:
  ./serve {{localhost}} 8080
```

Indented backticks, delimited by three backticks, are de-indented in the same manner as indented strings:

```js
# This backtick evaluates the command \`echo foo\necho bar\n\`, which produces the value \`foo\nbar\n\`.
stuff := \`\`\`
    echo foo
    echo bar
  \`\`\`
```

See the [Strings](https://just.systems/man/en/strings.html) section for details on unindenting.

Backticks may not start with `#!`. This syntax is reserved for a future upgrade.

The [`shell(…)` function](https://just.systems/man/en/functions.html#external-commands) provides a more general mechanism to invoke external commands, including the ability to execute the contents of a variable as a command, and to pass arguments to a command.