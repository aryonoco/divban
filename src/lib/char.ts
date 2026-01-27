// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Character predicates for validation. Range comparisons avoid regex
 * overhead and compose with `all` / `Predicate.some` for string-level checks.
 */

/** Predicate over a single character. */
export type CharPred = (c: string) => boolean;

export const isLower: CharPred = (c) => c >= "a" && c <= "z";

export const isDigit: CharPred = (c) => c >= "0" && c <= "9";

export const isAlpha: CharPred = (c) => isLower(c) || (c >= "A" && c <= "Z");

export const isAlphaNum: CharPred = (c) => isAlpha(c) || isDigit(c);

export const isHexDigit: CharPred = (c) =>
  isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");

export const isLowerHex: CharPred = (c) => isDigit(c) || (c >= "a" && c <= "f");

export const isWhitespace: CharPred = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";

export const isOneOf =
  (chars: string): CharPred =>
  (c): boolean =>
    chars.includes(c);
