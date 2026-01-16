---
title: "Recipe Parameters - Just Programmer's Manual"
source: "https://just.systems/man/en/recipe-parameters.html"
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

Recipes may have parameters. Here recipe `build` has a parameter called `target`:

```js
build target:
  @echo 'Building {{target}}…'
  cd {{target}} && make
```

To pass arguments on the command line, put them after the recipe name:

```shell
$ just build my-awesome-project
Building my-awesome-project…
cd my-awesome-project && make
```

To pass arguments to a dependency, put the dependency in parentheses along with the arguments:

```js
default: (build "main")

build target:
  @echo 'Building {{target}}…'
  cd {{target}} && make
```

Variables can also be passed as arguments to dependencies:

```js
target := "main"

_build version:
  @echo 'Building {{version}}…'
  cd {{version}} && make

build: (_build target)
```

A command’s arguments can be passed to dependency by putting the dependency in parentheses along with the arguments:

```js
build target:
  @echo "Building {{target}}…"

push target: (build target)
  @echo 'Pushing {{target}}…'
```

Parameters may have default values:

```js
default := 'all'

test target tests=default:
  @echo 'Testing {{target}}:{{tests}}…'
  ./test --tests {{tests}} {{target}}
```

Parameters with default values may be omitted:

```shell
$ just test server
Testing server:all…
./test --tests all server
```

Or supplied:

```shell
$ just test server unit
Testing server:unit…
./test --tests unit server
```

Default values may be arbitrary expressions, but expressions containing the `+`, `&&`, `||`, or `/` operators must be parenthesized:

```js
arch := "wasm"

test triple=(arch + "-unknown-unknown") input=(arch / "input.dat"):
  ./test {{triple}}
```

The last parameter of a recipe may be variadic, indicated with either a `+` or a `*` before the argument name:

```js
backup +FILES:
  scp {{FILES}} me@server.com:
```

Variadic parameters prefixed with `+` accept *one or more* arguments and expand to a string containing those arguments separated by spaces:

```shell
$ just backup FAQ.md GRAMMAR.md
scp FAQ.md GRAMMAR.md me@server.com:
FAQ.md                  100% 1831     1.8KB/s   00:00
GRAMMAR.md              100% 1666     1.6KB/s   00:00
```

Variadic parameters prefixed with `*` accept *zero or more* arguments and expand to a string containing those arguments separated by spaces, or an empty string if no arguments are present:

```js
commit MESSAGE *FLAGS:
  git commit {{FLAGS}} -m "{{MESSAGE}}"
```

Variadic parameters can be assigned default values. These are overridden by arguments passed on the command line:

```js
test +FLAGS='-q':
  cargo test {{FLAGS}}
```

`{{…}}` substitutions may need to be quoted if they contain spaces. For example, if you have the following recipe:

```js
search QUERY:
  lynx https://www.google.com/?q={{QUERY}}
```

And you type:

```shell
$ just search "cat toupee"
```

`just` will run the command `lynx https://www.google.com/?q=cat toupee`, which will get parsed by `sh` as `lynx`, `https://www.google.com/?q=cat`, and `toupee`, and not the intended `lynx` and `https://www.google.com/?q=cat toupee`.

You can fix this by adding quotes:

```js
search QUERY:
  lynx 'https://www.google.com/?q={{QUERY}}'
```

Parameters prefixed with a `$` will be exported as environment variables:

```js
foo $bar:
  echo $bar
```

Parameters may be constrained to match regular expression patterns using the `[arg("name", pattern="pattern")]` attribute <sup>1.45.0</sup>:

```js
[arg('n', pattern='\d+')]
double n:
  echo $(({{n}} * 2))
```

A leading `^` and trailing `$` are added to the pattern, so it must match the entire argument value.

You may constrain the pattern to a number of alternatives using the `|` operator:

```js
[arg('flag', pattern='--help|--version')]
info flag:
  just {{flag}}
```

Regular expressions are provided by the [Rust `regex` crate](https://docs.rs/regex/latest/regex/). See the [syntax documentation](https://docs.rs/regex/latest/regex/#syntax) for usage examples.

Usage information for a recipe may be printed with the `--usage` subcommand <sup>1.46.0</sup>:

```shell
$ just --usage foo
Usage: just foo [OPTIONS] bar

Arguments:
  bar
```

Help strings may be added to arguments using the `[arg(ARG, help=HELP)]` attribute:

```js
[arg("bar", help="hello")]
foo bar:
```
```shell
$ just --usage foo
Usage: just foo bar

Arguments:
  bar hello
```

Recipe parameters are positional by default.

In this `justfile`:

```js
@foo bar:
  echo bar={{bar}}
```

The parameter `bar` is positional:

```shell
$ just foo hello
bar=hello
```

The `[arg(ARG, long=OPTION)]` <sup>1.46.0</sup> attribute can be used to make a parameter a long option.

In this `justfile`:

```js
[arg("bar", long="bar")]
foo bar:
```

The parameter `bar` is given with the `--bar` option:

```shell
$ just foo --bar hello
bar=hello
```

Options may also be passed with `--name=value` syntax:

```shell
$ just foo --bar=hello
bar=hello
```

The value of `long` can be omitted, in which case the option defaults to the name of the parameter:

```js
[arg("bar", long)]
foo bar:
```

The `[arg(ARG, short=OPTION)]` <sup>1.46.0</sup> attribute can be used to make a parameter a short option.

In this `justfile`:

```js
[arg("bar", short="b")]
foo bar:
```

The parameter `bar` is given with the `-b` option:

```shell
$ just foo -b hello
bar=hello
```

If a parameter has both a long and short option, it may be passed using either.

Variadic `+` and `?` parameters cannot be options.

The `[arg(ARG, value=VALUE, …)]` <sup>1.46.0</sup> attribute can be used with `long` or `short` to make a parameter a flag which does not take a value.

In this `justfile`:

```js
[arg("bar", long="bar", value="hello")]
foo bar:
```

The parameter `bar` is given with the `--bar` option, but does not take a value, and instead takes the value given in the `[arg]` attribute:

```shell
$ just foo --bar
bar=hello
```

This is useful for unconditionally requiring a flag like `--force` on dangerous commands.

A flag is optional if its parameter has a default:

```js
[arg("bar", long="bar", value="hello")]
foo bar="goodbye":
```

Causing it to receive the default when not passed in the invocation:

```shell
$ just foo
bar=goodbye
```