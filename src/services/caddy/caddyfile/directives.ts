// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Recursive directive tree rendering. Directives can nest arbitrarily
 * deep (handle { reverse_proxy { ... } }). This module handles both
 * simple directives and nested blocks, tracking indent level for
 * readable output.
 */

import { Match, pipe } from "effect";
import type { Directive } from "../schema";
import { Caddy, type CaddyOp, escapeValue, indent } from "./format";

export const renderDirective = (directive: Directive, level = 0): string => {
  const prefix = indent(level);
  const args = directive.args?.map(escapeValue).join(" ") ?? "";
  const argsStr = args ? ` ${args}` : "";

  // Base case vs nested block
  return !directive.block || directive.block.length === 0
    ? `${prefix}${directive.name}${argsStr}`
    : `${prefix}${directive.name}${argsStr} {\n${directive.block.map((child) => renderDirective(child, level + 1)).join("\n")}\n${prefix}}`;
};

export const renderDirectives = (directives: readonly Directive[], level = 0): string =>
  directives.map((d) => renderDirective(d, level)).join("\n");

export const directiveOp = (directive: Directive): CaddyOp =>
  !directive.block || directive.block.length === 0
    ? Caddy.directive(directive.name, directive.args)
    : Caddy.seq(
        Caddy.open(directive.name, directive.args),
        Caddy.forEach(directive.block, directiveOp),
        Caddy.close
      );

export const directivesOps = (directives: readonly Directive[], _level = 0): CaddyOp =>
  directives.length === 0 ? Caddy.id : Caddy.forEach(directives, directiveOp);

export const Directives: Record<string, (...args: never[]) => Directive> = {
  reverseProxy: (
    upstreams: string[],
    options?: { healthCheck?: boolean; lb?: string }
  ): Directive => {
    const block: Directive[] = [
      ...(options?.healthCheck
        ? [
            { name: "health_uri", args: ["/health"] },
            { name: "health_interval", args: ["30s"] },
          ]
        : []),
      ...(options?.lb ? [{ name: "lb_policy", args: [options.lb] }] : []),
    ];

    return block.length > 0
      ? { name: "reverse_proxy", args: upstreams, block }
      : { name: "reverse_proxy", args: upstreams };
  },

  fileServer: (options?: { root?: string; browse?: boolean }): Directive => {
    const block: Directive[] = [
      ...(options?.root ? [{ name: "root", args: [options.root] }] : []),
      ...(options?.browse ? [{ name: "browse" }] : []),
    ];

    return block.length > 0 ? { name: "file_server", block } : { name: "file_server" };
  },

  encode: (algorithms: string[] = ["gzip", "zstd"]): Directive => ({
    name: "encode",
    args: algorithms,
  }),

  header: (headers: Record<string, string>): Directive => ({
    name: "header",
    block: Object.entries(headers).map(([name, value]) => ({
      name,
      args: [value],
    })),
  }),

  respond: (body: string, status?: number): Directive => ({
    name: "respond",
    args: status ? [body, String(status)] : [body],
  }),

  redir: (target: string, code?: number): Directive => ({
    name: "redir",
    args: code ? [target, String(code)] : [target],
  }),

  rewrite: (pattern: string, replacement: string): Directive => ({
    name: "rewrite",
    args: [pattern, replacement],
  }),

  log: (options?: { output?: string; format?: string; level?: string }): Directive => {
    const block: Directive[] = [
      ...(options?.output ? [{ name: "output", args: [options.output] }] : []),
      ...(options?.format ? [{ name: "format", args: [options.format] }] : []),
      ...(options?.level ? [{ name: "level", args: [options.level] }] : []),
    ];

    return block.length > 0 ? { name: "log", block } : { name: "log" };
  },

  tls: (options?: {
    email?: string;
    cert?: string;
    key?: string;
    internal?: boolean;
  }): Directive =>
    pipe(
      Match.value(options ?? {}),
      Match.when({ internal: true }, (): Directive => ({ name: "tls", args: ["internal"] })),
      Match.when(
        (o): o is { cert: string; key: string } => Boolean(o.cert && o.key),
        (o): Directive => ({ name: "tls", args: [o.cert, o.key] })
      ),
      Match.when(
        (o): o is { email: string } => Boolean(o.email),
        (o): Directive => ({ name: "tls", args: [o.email] })
      ),
      Match.orElse((): Directive => ({ name: "tls" }))
    ),

  basicauth: (users: Array<{ username: string; passwordHash: string }>): Directive => ({
    name: "basicauth",
    block: users.map((u) => ({
      name: u.username,
      args: [u.passwordHash],
    })),
  }),

  import: (name: string, args?: string[]): Directive => ({
    name: "import",
    args: args ? [name, ...args] : [name],
  }),

  handle: (matcher: string | undefined, directives: Directive[]): Directive =>
    matcher
      ? { name: "handle", args: [matcher], block: directives }
      : { name: "handle", block: directives },

  handlePath: (path: string, directives: Directive[]): Directive => ({
    name: "handle_path",
    args: [path],
    block: directives,
  }),

  route: (matcher: string | undefined, directives: Directive[]): Directive =>
    matcher
      ? { name: "route", args: [matcher], block: directives }
      : { name: "route", block: directives },
};
