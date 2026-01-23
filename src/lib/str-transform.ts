// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Functional string transformations using fold-based processing.
 * Curried for pipe() composition. Avoids imperative loops and regex
 * where character-by-character logic is clearer (e.g., collapseChar
 * for normalizing paths with multiple slashes).
 */

import { chars } from "./str";

export const foldChars =
  <A>(initial: A, step: (acc: A, c: string) => A) =>
  (s: string): A =>
    chars(s).reduce(step, initial);

// mapChars(c => c === ":" ? "-" : c)("10:30") => "10-30"
export const mapChars = (f: (c: string) => string): ((s: string) => string[]) =>
  foldChars<string[]>([], (acc, c) => [...acc, f(c)]);

export const mapCharsToString =
  (f: (c: string) => string) =>
  (s: string): string =>
    mapChars(f)(s).join("");

// filterChars(c => c !== "=")("a==b") => "ab"
export const filterChars = (pred: (c: string) => boolean): ((s: string) => string[]) =>
  foldChars<string[]>([], (acc, c) => (pred(c) ? [...acc, c] : acc));

export const filterCharsToString =
  (pred: (c: string) => boolean) =>
  (s: string): string =>
    filterChars(pred)(s).join("");

// collapseChar("/")("a//b///c") => "a/b/c"
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

export const stripSuffix =
  (suffix: string) =>
  (s: string): string =>
    s.endsWith(suffix) ? s.slice(0, -suffix.length) : s;

export const stripPrefix =
  (prefix: string) =>
  (s: string): string =>
    s.startsWith(prefix) ? s.slice(prefix.length) : s;

export const replaceChars = (mapping: ReadonlyMap<string, string>): ((s: string) => string) =>
  mapCharsToString((c) => mapping.get(c) ?? c);

export const escapeWith =
  (mapping: ReadonlyMap<string, string>) =>
  (s: string): string =>
    chars(s)
      .map((c) => mapping.get(c) ?? c)
      .join("");
