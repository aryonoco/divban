---
title: "Multi-Line Constructs - Just Programmer's Manual"
source: "https://just.systems/man/en/multi-line-constructs.html"
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

Recipes without an initial shebang are evaluated and run line-by-line, which means that multi-line constructs probably won’t do what you want.

For example, with the following `justfile`:

```js
conditional:
  if true; then
    echo 'True!'
  fi
```

The extra leading whitespace before the second line of the `conditional` recipe will produce a parse error:

```shell
$ just conditional
error: Recipe line has extra leading whitespace
  |
3 |         echo 'True!'
  |     ^^^^^^^^^^^^^^^^
```

To work around this, you can write conditionals on one line, escape newlines with slashes, or add a shebang to your recipe. Some examples of multi-line constructs are provided for reference.

```js
conditional:
  if true; then echo 'True!'; fi
```
```js
conditional:
  if true; then \
    echo 'True!'; \
  fi
```
```js
conditional:
  #!/usr/bin/env sh
  if true; then
    echo 'True!'
  fi
```
```js
for:
  for file in \`ls .\`; do echo $file; done
```
```js
for:
  for file in \`ls .\`; do \
    echo $file; \
  done
```
```js
for:
  #!/usr/bin/env sh
  for file in \`ls .\`; do
    echo $file
  done
```
```js
while:
  while \`server-is-dead\`; do ping -c 1 server; done
```
```js
while:
  while \`server-is-dead\`; do \
    ping -c 1 server; \
  done
```
```js
while:
  #!/usr/bin/env sh
  while \`server-is-dead\`; do
    ping -c 1 server
  done
```

Parenthesized expressions can span multiple lines:

```js
abc := ('a' +
        'b'
         + 'c')

abc2 := (
  'a' +
  'b' +
  'c'
)

foo param=('foo'
      + 'bar'
    ):
  echo {{param}}

bar: (foo
        'Foo'
     )
  echo 'Bar!'
```

Lines ending with a backslash continue on to the next line as if the lines were joined by whitespace <sup>1.15.0</sup>:

```js
a := 'foo' + \
     'bar'

foo param1 \
  param2='foo' \
  *varparam='': dep1 \
                (dep2 'foo')
  echo {{param1}} {{param2}} {{varparam}}

dep1: \
    # this comment is not part of the recipe body
  echo 'dep1'

dep2 \
  param:
    echo 'Dependency with parameter {{param}}'
```

Backslash line continuations can also be used in interpolations. The line following the backslash must be indented.

```js
recipe:
  echo '{{ \
  "This interpolation " + \
    "has a lot of text." \
  }}'
  echo 'back to recipe body'
```