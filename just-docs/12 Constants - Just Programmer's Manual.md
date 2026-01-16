---
title: "Constants - Just Programmer's Manual"
source: "https://just.systems/man/en/constants.html"
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

A number of constants are predefined:

| Name | Value | Value on Windows |
| --- | --- | --- |
| `HEX` <sup xmlns="http://www.w3.org/1999/xhtml">1.27.0</sup> | `"0123456789abcdef"` |  |
| `HEXLOWER` <sup xmlns="http://www.w3.org/1999/xhtml">1.27.0</sup> | `"0123456789abcdef"` |  |
| `HEXUPPER` <sup xmlns="http://www.w3.org/1999/xhtml">1.27.0</sup> | `"0123456789ABCDEF"` |  |
| `PATH_SEP` <sup xmlns="http://www.w3.org/1999/xhtml">1.41.0</sup> | `"/"` | `"\"` |
| `PATH_VAR_SEP` <sup xmlns="http://www.w3.org/1999/xhtml">1.41.0</sup> | `":"` | `";"` |
| `CLEAR` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\ec"` |  |
| `NORMAL` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[0m"` |  |
| `BOLD` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[1m"` |  |
| `ITALIC` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[3m"` |  |
| `UNDERLINE` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[4m"` |  |
| `INVERT` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[7m"` |  |
| `HIDE` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[8m"` |  |
| `STRIKETHROUGH` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[9m"` |  |
| `BLACK` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[30m"` |  |
| `RED` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[31m"` |  |
| `GREEN` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[32m"` |  |
| `YELLOW` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[33m"` |  |
| `BLUE` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[34m"` |  |
| `MAGENTA` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[35m"` |  |
| `CYAN` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[36m"` |  |
| `WHITE` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[37m"` |  |
| `BG_BLACK` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[40m"` |  |
| `BG_RED` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[41m"` |  |
| `BG_GREEN` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[42m"` |  |
| `BG_YELLOW` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[43m"` |  |
| `BG_BLUE` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[44m"` |  |
| `BG_MAGENTA` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[45m"` |  |
| `BG_CYAN` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[46m"` |  |
| `BG_WHITE` <sup xmlns="http://www.w3.org/1999/xhtml">1.37.0</sup> | `"\e[47m"` |  |

```js
@foo:
  echo {{HEX}}
```
```shell
$ just foo
0123456789abcdef
```

Constants starting with `\e` are [ANSI escape sequences](https://en.wikipedia.org/wiki/ANSI_escape_code).

`CLEAR` clears the screen, similar to the `clear` command. The rest are of the form `\e[Nm`, where `N` is an integer, and set terminal display attributes.

Terminal display attribute escape sequences can be combined, for example text weight `BOLD`, text style `STRIKETHROUGH`, foreground color `CYAN`, and background color `BG_BLUE`. They should be followed by `NORMAL`, to reset the terminal back to normal.

Escape sequences should be quoted, since `[` is treated as a special character by some shells.

```js
@foo:
  echo '{{BOLD + STRIKETHROUGH + CYAN + BG_BLUE}}Hi!{{NORMAL}}'
```