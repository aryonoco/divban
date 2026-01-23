// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Functional string transformations using Effect Chunk combinators.
 * Curried for pipe() composition. Avoids imperative loops and regex
 * where character-by-character logic is clearer (e.g., collapseChar
 * for normalizing paths with multiple slashes).
 *
 */

import { Chunk, pipe } from "effect";
import { chars } from "./str";

export const mapChars =
  (f: (c: string) => string) =>
  (s: string): Chunk.Chunk<string> =>
    pipe(Chunk.fromIterable(chars(s)), Chunk.map(f));

export const mapCharsToString =
  (f: (c: string) => string) =>
  (s: string): string =>
    pipe(Chunk.fromIterable(chars(s)), Chunk.map(f), Chunk.join(""));

export const filterChars =
  (pred: (c: string) => boolean) =>
  (s: string): Chunk.Chunk<string> =>
    pipe(Chunk.fromIterable(chars(s)), Chunk.filter(pred));

export const filterCharsToString =
  (pred: (c: string) => boolean) =>
  (s: string): string =>
    pipe(Chunk.fromIterable(chars(s)), Chunk.filter(pred), Chunk.join(""));

// Manual fold needed here because we need previous-element state
type CollapseState = { readonly prev: string | null; readonly result: Chunk.Chunk<string> };

const collapseStep =
  (char: string) =>
  (state: CollapseState, c: string): CollapseState =>
    c === char && state.prev === char ? state : { prev: c, result: Chunk.append(state.result, c) };

export const collapseChar =
  (char: string) =>
  (s: string): string => {
    const initial: CollapseState = { prev: null, result: Chunk.empty() };
    return Chunk.join(chars(s).reduce(collapseStep(char), initial).result, "");
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

export const escapeWith: (mapping: ReadonlyMap<string, string>) => (s: string) => string =
  replaceChars;
