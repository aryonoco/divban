// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * String transformations via fold.
 * Functions are curried for pipe composition.
 */

import { chars } from "./str";

/**
 * Fold over characters with accumulator.
 * This is the primitive from which other transforms derive.
 */
export const foldChars =
  <A>(initial: A, step: (acc: A, c: string) => A) =>
  (s: string): A =>
    chars(s).reduce(step, initial);

/**
 * Map each character through a function.
 * mapChars(c => c === ":" ? "-" : c)("10:30") => "10-30"
 */
export const mapChars = (f: (c: string) => string): ((s: string) => string[]) =>
  foldChars<string[]>([], (acc, c) => [...acc, f(c)]);

export const mapCharsToString =
  (f: (c: string) => string) =>
  (s: string): string =>
    mapChars(f)(s).join("");

/**
 * Filter characters by predicate.
 * filterChars(c => c !== "=")("a==b") => "ab"
 */
export const filterChars = (pred: (c: string) => boolean): ((s: string) => string[]) =>
  foldChars<string[]>([], (acc, c) => (pred(c) ? [...acc, c] : acc));

export const filterCharsToString =
  (pred: (c: string) => boolean) =>
  (s: string): string =>
    filterChars(pred)(s).join("");

/**
 * Collapse consecutive occurrences of a character.
 * State = { prev: string | null, result: readonly string[] }
 * collapseChar("/")("a//b///c") => "a/b/c"
 */
type CollapseState = { readonly prev: string | null; readonly result: readonly string[] };

const collapseStep =
  (char: string) =>
  (state: CollapseState, c: string): CollapseState =>
    c === char && state.prev === char ? state : { prev: c, result: [...state.result, c] };

export const collapseChar =
  (char: string) =>
  (s: string): string => {
    const initial: CollapseState = { prev: null, result: [] };
    return chars(s).reduce(collapseStep(char), initial).result.join("");
  };

/**
 * Remove suffix if present (total function).
 */
export const stripSuffix =
  (suffix: string) =>
  (s: string): string =>
    s.endsWith(suffix) ? s.slice(0, -suffix.length) : s;

/**
 * Remove prefix if present (total function).
 */
export const stripPrefix =
  (prefix: string) =>
  (s: string): string =>
    s.startsWith(prefix) ? s.slice(prefix.length) : s;

/**
 * Replace characters using a lookup map (total: unknown chars pass through).
 */
export const replaceChars = (mapping: ReadonlyMap<string, string>): ((s: string) => string) =>
  mapCharsToString((c) => mapping.get(c) ?? c);

/**
 * Escape characters with a prefix using lookup.
 */
export const escapeWith =
  (mapping: ReadonlyMap<string, string>) =>
  (s: string): string =>
    chars(s)
      .map((c) => mapping.get(c) ?? c)
      .join("");
