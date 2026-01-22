// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddyfile formatting utilities using pure functional patterns.
 *
 * CaddyOp is an endomorphism (Endo CaddyfileState) that transforms state.
 * Operations compose via function composition with identity as the monoid unit.
 */

import { Chunk, Option, pipe } from "effect";
import { identity } from "../../../lib/collection-utils";
import { mapOr, nonEmpty } from "../../../lib/option-helpers";
import { escapeWith } from "../../../lib/str-transform";

// ============================================================================
// Value Escaping
// ============================================================================

/** Escape double quotes with backslash */
const QUOTE_ESCAPE_MAP: ReadonlyMap<string, string> = new Map([['"', '\\"']]);
const escapeQuotes = escapeWith(QUOTE_ESCAPE_MAP);

/**
 * Escape a value for Caddyfile format.
 */
export const escapeValue = (value: string): string => {
  if (
    value.includes(" ") ||
    value.includes('"') ||
    value.includes("{") ||
    value.includes("}") ||
    value.includes("#")
  ) {
    return `"${escapeQuotes(value)}"`;
  }
  return value;
};

/**
 * Create indentation string.
 */
export const indent = (level: number): string => "\t".repeat(level);

/**
 * Join arguments with proper escaping.
 */
export const joinArgs = (args: readonly string[]): string => args.map(escapeValue).join(" ");

/**
 * Format a block opening.
 */
export const openBlock = (name: string, args?: readonly string[]): string => {
  const argsStr = mapOr(nonEmpty(args), "", (a) => ` ${joinArgs(a)}`);
  return `${name}${argsStr} {`;
};

/**
 * Format a simple line (name + args).
 */
export const formatLine = (name: string, args?: readonly string[]): string =>
  args && args.length > 0 ? `${name} ${joinArgs(args)}` : name;

// ============================================================================
// Immutable State
// ============================================================================

/**
 * Caddyfile builder state.
 */
interface CaddyfileState {
  readonly lines: Chunk.Chunk<string>;
  readonly indentLevel: number;
}

/** Monoid identity for CaddyfileState */
const emptyState: CaddyfileState = {
  lines: Chunk.empty(),
  indentLevel: 0,
};

// ============================================================================
// State Transformers
// ============================================================================

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

/** Render final output from state */
const render = (state: CaddyfileState): string =>
  `${Chunk.toReadonlyArray(state.lines).join("\n")}\n`;

// ============================================================================
// CaddyOp: Endomorphism on CaddyfileState
// ============================================================================

/**
 * CaddyOp is an endomorphism (Endo CaddyfileState).
 * Composes via function composition: (f . g)(s) = f(g(s))
 * Identity element: identity function
 */
export type CaddyOp = (state: CaddyfileState) => CaddyfileState;

/**
 * Compose two CaddyOps (Kleisli-style, left-to-right).
 * compose(f, g) applies f first, then g.
 */
const compose =
  (f: CaddyOp, g: CaddyOp): CaddyOp =>
  (s): CaddyfileState =>
    g(f(s));

/**
 * Fold multiple CaddyOps into one (monoidal concat).
 */
const fold = (ops: readonly CaddyOp[]): CaddyOp => ops.reduce(compose, identity);

// ============================================================================
// DSL Operations
// ============================================================================

export const Caddy = {
  /** Identity operation - does nothing. Monoid identity. */
  id: identity as CaddyOp,

  /** Add a line at current indentation */
  line: (content: string): CaddyOp => appendLine(content),

  /** Add an empty line */
  blank: appendBlank as CaddyOp,

  /** Add a comment */
  comment: (text: string): CaddyOp => appendLine(`# ${text}`),

  /** Open a block: add opening line and increase indent */
  open: (name: string, args?: readonly string[]): CaddyOp =>
    compose(appendLine(openBlock(name, args)), incrementIndent),

  /** Close a block: decrease indent and add closing brace */
  close: compose(decrementIndent, (s): CaddyfileState => appendLine("}")(s)) as CaddyOp,

  /** Add a directive (name + optional args) */
  directive: (name: string, args?: readonly string[]): CaddyOp =>
    appendLine(formatLine(name, args)),

  /** Add raw content (splits on newlines, each line indented) */
  raw: (content: string): CaddyOp => fold(content.split("\n").map(appendLine)),

  /**
   * Conditional operation (LAZY).
   * Only evaluates `op` thunk if condition is true.
   * Use when the operation is expensive to construct.
   */
  whenLazy: (condition: boolean, op: () => CaddyOp): CaddyOp => (condition ? op() : identity),

  /**
   * Conditional operation (eager).
   * The `op` is already evaluated - use for simple operations.
   */
  when: (condition: boolean, op: CaddyOp): CaddyOp => (condition ? op : identity),

  /**
   * Conditional directive: add only if value is defined.
   */
  maybeDirective: (name: string, value: string | undefined): CaddyOp =>
    pipe(
      Option.fromNullable(value),
      Option.match({
        onNone: (): CaddyOp => identity,
        onSome: (v): CaddyOp => appendLine(formatLine(name, [v])),
      })
    ),

  /** Conditional directive with number conversion */
  maybeDirectiveNum: (name: string, value: number | undefined): CaddyOp =>
    pipe(
      Option.fromNullable(value),
      Option.match({
        onNone: (): CaddyOp => identity,
        onSome: (v): CaddyOp => appendLine(formatLine(name, [String(v)])),
      })
    ),

  /**
   * Sequence operations (variadic).
   * seq(a, b, c) applies a, then b, then c.
   */
  seq: (...ops: readonly CaddyOp[]): CaddyOp => fold(ops),

  /**
   * Sequence operations from array.
   * Useful for dynamic operation lists.
   */
  all: (ops: readonly CaddyOp[]): CaddyOp => fold(ops),

  /**
   * Map over array and sequence results.
   * `traverse` for the CaddyOp "applicative".
   */
  forEach: <A>(items: readonly A[], f: (item: A) => CaddyOp): CaddyOp => fold(items.map(f)),

  /**
   * FlatMap over array and sequence results.
   * Each item can produce multiple operations.
   */
  flatForEach: <A>(items: readonly A[], f: (item: A) => readonly CaddyOp[]): CaddyOp =>
    fold(items.flatMap(f)),
} as const;

// ============================================================================
// Builder Function (main entry point)
// ============================================================================

/**
 * Build a Caddyfile from a sequence of operations.
 * This is the "runState" that evaluates the composed operations.
 *
 * @example
 * const content = caddyfile(
 *   Caddy.comment("Generated by divban"),
 *   Caddy.blank,
 *   Caddy.open("example.com"),
 *   Caddy.directive("reverse_proxy", ["localhost:3000"]),
 *   Caddy.close
 * );
 */
export const caddyfile = (...ops: readonly CaddyOp[]): string => render(fold(ops)(emptyState));
