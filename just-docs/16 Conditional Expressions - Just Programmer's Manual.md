---
title: "Conditional Expressions - Just Programmer's Manual"
source: "https://just.systems/man/en/conditional-expressions.html"
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

`if` / `else` expressions evaluate different branches depending on if two expressions evaluate to the same value:

```js
foo := if "2" == "2" { "Good!" } else { "1984" }

bar:
  @echo "{{foo}}"
```
```shell
$ just bar
Good!
```

It is also possible to test for inequality:

```js
foo := if "hello" != "goodbye" { "xyz" } else { "abc" }

bar:
  @echo {{foo}}
```
```shell
$ just bar
xyz
```

And match against regular expressions:

```js
foo := if "hello" =~ 'hel+o' { "match" } else { "mismatch" }

bar:
  @echo {{foo}}
```
```shell
$ just bar
match
```

Regular expressions are provided by the [regex crate](https://github.com/rust-lang/regex), whose syntax is documented on [docs.rs](https://docs.rs/regex/1.5.4/regex/#syntax). Since regular expressions commonly use backslash escape sequences, consider using single-quoted string literals, which will pass slashes to the regex parser unmolested.

Conditional expressions short-circuit, which means they only evaluate one of their branches. This can be used to make sure that backtick expressions don’t run when they shouldn’t.

```js
foo := if env_var("RELEASE") == "true" { \`get-something-from-release-database\` } else { "dummy-value" }
```

Conditionals can be used inside of recipes:

```js
bar foo:
  echo {{ if foo == "bar" { "hello" } else { "goodbye" } }}
```

Multiple conditionals can be chained:

```js
foo := if "hello" == "goodbye" {
  "xyz"
} else if "a" == "a" {
  "abc"
} else {
  "123"
}

bar:
  @echo {{foo}}
```
```shell
$ just bar
abc
```