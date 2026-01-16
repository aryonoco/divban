---
title: "Command-line Options - Just Programmer's Manual"
source: "https://just.systems/man/en/command-line-options.html"
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

`just` supports a number of useful command-line options for listing, dumping, and debugging recipes and variables:

```shell
$ just --list
Available recipes:
  js
  perl
  polyglot
  python
  ruby
$ just --show perl
perl:
  #!/usr/bin/env perl
  print "Larry Wall says Hi!\n";
$ just --show polyglot
polyglot: python js perl sh ruby
```

Some command-line options can be set with environment variables

For example, unstable features can be enabled either with the `--unstable` flag:

```shell
$ just --unstable
```

Or by setting the `JUST_UNSTABLE` environment variable:

```shell
$ export JUST_UNSTABLE=1
$ just
```

Since environment variables are inherited by child processes, command-line options set with environment variables are inherited by recursive invocations of `just`, where as command line options set with arguments are not.

Consult `just --help` for which options can be set with environment variables.