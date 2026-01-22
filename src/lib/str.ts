// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Total string operations.
 * All partial operations return Option<T>.
 */

import { Option } from "effect";

/** Convert string to array of single characters (always total) */
export const chars = (s: string): readonly string[] => Array.from(s);

/** Safe head: first character or None (unicode-aware) */
export const head = (s: string): Option.Option<string> => Option.fromNullable(chars(s)[0]);

/** Safe uncons: split into (head, tail) or None (unicode-aware) */
export const uncons = (s: string): Option.Option<readonly [string, string]> => {
  const arr = chars(s);
  const first = arr[0];
  return first !== undefined ? Option.some([first, arr.slice(1).join("")] as const) : Option.none();
};

/** Safe charAt with bounds checking (unicode-aware) */
export const charAt =
  (i: number) =>
  (s: string): Option.Option<string> =>
    Option.fromNullable(chars(s)[i]);

/** Safe last character (unicode-aware) */
export const last = (s: string): Option.Option<string> => Option.fromNullable(chars(s).at(-1));

/** Check if all characters satisfy predicate */
export const all =
  (pred: (c: string) => boolean) =>
  (s: string): boolean =>
    chars(s).every(pred);

/** Check if any character satisfies predicate */
export const any =
  (pred: (c: string) => boolean) =>
  (s: string): boolean =>
    chars(s).some(pred);
