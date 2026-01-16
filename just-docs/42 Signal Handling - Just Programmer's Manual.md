---
title: "Signal Handling - Just Programmer's Manual"
source: "https://just.systems/man/en/signal-handling.html"
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

[Signals](https://en.wikipedia.org/wiki/Signal_\(IPC\)) are messsages sent to running programs to trigger specific behavior. For example, `SIGINT` is sent to all processes in the terminal forground process group when `CTRL-C` is pressed.

`just` tries to exit when requested by a signal, but it also tries to avoid leaving behind running child proccesses, two goals which are somewhat in conflict.

If `just` exits leaving behind child processes, the user will have no recourse but to `ps aux | grep` for the children and manually `kill` them, a tedious endevour.

`SIGHUP`, `SIGINT`, and `SIGQUIT` are generated when the user closes the terminal, types `ctrl-c`, or types `ctrl-\`, respectively, and are sent to all processes in the foreground process group.

`SIGTERM` is the default signal sent by the `kill` command, and is delivered only to its intended victim.

When a child process is not running, `just` will exit immediately on receipt of any of the above signals.

When a child process *is* running, `just` will wait until it terminates, to avoid leaving it behind.

Additionally, on receipt of `SIGTERM`, `just` will forward `SIGTERM` to any running children <sup>1.41.0</sup>, since unlike other fatal signals, `SIGTERM`, was likely sent to `just` alone.

Regardless of whether a child process terminates successfully after `just` receives a fatal signal, `just` halts execution.

`SIGINFO` is sent to all processes in the foreground process group when the user types `ctrl-t` on [BSD](https://en.wikipedia.org/wiki/Berkeley_Software_Distribution) -derived operating systems, including MacOS, but not Linux.

`just` responds by printing a list of all child process IDs and commands <sup>1.41.0</sup>.

On Windows, `just` behaves as if it had received `SIGINT` when the user types `ctrl-c`. Other signals are unsupported.