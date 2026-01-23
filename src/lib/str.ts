// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Total string functions that compose safely in Effect pipelines.
 * Unlike String.prototype methods that throw on edge cases (empty strings,
 * out-of-bounds indices), these return Option for partial operations.
 * Unicode-aware via Array.from() instead of string indexing.
 */

import { Option } from "effect";

/** Unicode-aware via Array.from() instead of string indexing. */
export const chars = (s: string): readonly string[] => Array.from(s);

export const head = (s: string): Option.Option<string> => Option.fromNullable(chars(s)[0]);

/** Haskell-style uncons: split into (head, tail) or None. */
export const uncons = (s: string): Option.Option<readonly [string, string]> => {
  const arr = chars(s);
  const first = arr[0];
  return first !== undefined ? Option.some([first, arr.slice(1).join("")] as const) : Option.none();
};

export const charAt =
  (i: number) =>
  (s: string): Option.Option<string> =>
    Option.fromNullable(chars(s)[i]);

export const last = (s: string): Option.Option<string> => Option.fromNullable(chars(s).at(-1));

export const all =
  (pred: (c: string) => boolean) =>
  (s: string): boolean =>
    chars(s).every(pred);

export const any =
  (pred: (c: string) => boolean) =>
  (s: string): boolean =>
    chars(s).some(pred);
