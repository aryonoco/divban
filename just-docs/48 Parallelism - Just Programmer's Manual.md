---
title: "Parallelism - Just Programmer's Manual"
source: "https://just.systems/man/en/parallelism.html"
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

Dependencies may be run in parallel with the `[parallel]` attribute.

In this `justfile`, `foo`, `bar`, and `baz` will execute in parallel when `main` is run:

```js
[parallel]
main: foo bar baz

foo:
  sleep 1

bar:
  sleep 1

baz:
  sleep 1
```

GNU `parallel` may be used to run recipe lines concurrently:

```js
parallel:
  #!/usr/bin/env -S parallel --shebang --ungroup --jobs {{ num_cpus() }}
  echo task 1 start; sleep 3; echo task 1 done
  echo task 2 start; sleep 3; echo task 2 done
  echo task 3 start; sleep 3; echo task 3 done
  echo task 4 start; sleep 3; echo task 4 done
```