// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddyfile DSL via state transformers. `CaddyOp` tracks indent level
 * and accumulates lines, preventing unmatched braces and wrong
 * indentation. Composition via `pipe()` mirrors Caddyfile nesting.
 */

import { Chunk, Option, pipe } from "effect";
import { identity } from "../../../lib/collection-utils";
import { quoteEscapeCodec } from "../../../lib/escape-codec";
import { mapOr, nonEmpty } from "../../../lib/option-helpers";

const escapeQuotes = quoteEscapeCodec.escape;

const needsQuoting = (value: string): boolean =>
  value.includes(" ") ||
  value.includes('"') ||
  value.includes("{") ||
  value.includes("}") ||
  value.includes("#");

export const escapeValue = (value: string): string =>
  needsQuoting(value) ? `"${escapeQuotes(value)}"` : value;

export const indent = (level: number): string => "\t".repeat(level);

export const joinArgs = (args: readonly string[]): string => args.map(escapeValue).join(" ");

export const openBlock = (name: string, args?: readonly string[]): string => {
  const argsStr = mapOr(nonEmpty(args), "", (a) => ` ${joinArgs(a)}`);
  return `${name}${argsStr} {`;
};

export const formatLine = (name: string, args?: readonly string[]): string =>
  args && args.length > 0 ? `${name} ${joinArgs(args)}` : name;

interface CaddyfileState {
  readonly lines: Chunk.Chunk<string>;
  readonly indentLevel: number;
}

const emptyState: CaddyfileState = {
  lines: Chunk.empty(),
  indentLevel: 0,
};

const appendLine =
  (content: string) =>
  (state: CaddyfileState): CaddyfileState => ({
    ...state,
    lines: Chunk.append(state.lines, `${indent(state.indentLevel)}${content}`),
  });

const appendBlank = (state: CaddyfileState): CaddyfileState => ({
  ...state,
  lines: Chunk.append(state.lines, ""),
});

const incrementIndent = (state: CaddyfileState): CaddyfileState => ({
  ...state,
  indentLevel: state.indentLevel + 1,
});

const decrementIndent = (state: CaddyfileState): CaddyfileState => ({
  ...state,
  indentLevel: Math.max(0, state.indentLevel - 1),
});

const render = (state: CaddyfileState): string =>
  `${Chunk.toReadonlyArray(state.lines).join("\n")}\n`;

export type CaddyOp = (state: CaddyfileState) => CaddyfileState;

/** Left-to-right: `compose(f, g)` applies `f` first, then `g`. */
const compose =
  (f: CaddyOp, g: CaddyOp): CaddyOp =>
  (s): CaddyfileState =>
    g(f(s));

const combine = (ops: readonly CaddyOp[]): CaddyOp => ops.reduce(compose, identity);

export const Caddy = {
  id: identity as CaddyOp,
  line: (content: string): CaddyOp => appendLine(content),
  blank: appendBlank as CaddyOp,
  comment: (text: string): CaddyOp => appendLine(`# ${text}`),

  open: (name: string, args?: readonly string[]): CaddyOp =>
    compose(appendLine(openBlock(name, args)), incrementIndent),

  close: compose(decrementIndent, (s): CaddyfileState => appendLine("}")(s)) as CaddyOp,

  directive: (name: string, args?: readonly string[]): CaddyOp =>
    appendLine(formatLine(name, args)),

  raw: (content: string): CaddyOp => combine(content.split("\n").map(appendLine)),

  /** Defers `op` construction until needed — use when building the op is expensive. */
  whenLazy: (condition: boolean, op: () => CaddyOp): CaddyOp => (condition ? op() : identity),

  /** `op` is already constructed — use for cheap, pre-built operations. */
  when: (condition: boolean, op: CaddyOp): CaddyOp => (condition ? op : identity),

  maybeDirective: (name: string, value: string | undefined): CaddyOp =>
    pipe(
      Option.fromNullable(value),
      Option.match({
        onNone: (): CaddyOp => identity,
        onSome: (v): CaddyOp => appendLine(formatLine(name, [v])),
      })
    ),

  maybeDirectiveNum: (name: string, value: number | undefined): CaddyOp =>
    pipe(
      Option.fromNullable(value),
      Option.match({
        onNone: (): CaddyOp => identity,
        onSome: (v): CaddyOp => appendLine(formatLine(name, [String(v)])),
      })
    ),

  seq: (...ops: readonly CaddyOp[]): CaddyOp => combine(ops),
  all: (ops: readonly CaddyOp[]): CaddyOp => combine(ops),
  forEach: <A>(items: readonly A[], f: (item: A) => CaddyOp): CaddyOp => combine(items.map(f)),
  flatForEach: <A>(items: readonly A[], f: (item: A) => readonly CaddyOp[]): CaddyOp =>
    combine(items.flatMap(f)),
} as const;

/** Run a sequence of `CaddyOp`s from empty state and render the result. */
export const caddyfile = (...ops: readonly CaddyOp[]): string => render(combine(ops)(emptyState));
