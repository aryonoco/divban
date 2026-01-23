// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Character predicates for validation without regex overhead.
 * Used with Str.all/any for input validation (e.g., isValidUsername).
 * Direct comparisons are faster than regex for simple character sets.
 */

/** a-z */
export const isLower = (c: string): boolean => c >= "a" && c <= "z";

/** A-Z */
export const isUpper = (c: string): boolean => c >= "A" && c <= "Z";

/** 0-9 */
export const isDigit = (c: string): boolean => c >= "0" && c <= "9";

/** a-zA-Z */
export const isAlpha = (c: string): boolean => isLower(c) || isUpper(c);

/** a-zA-Z0-9 */
export const isAlphaNum = (c: string): boolean => isAlpha(c) || isDigit(c);

/** 0-9a-fA-F */
export const isHexDigit = (c: string): boolean =>
  isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");

/** Lowercase hex: 0-9a-f */
export const isLowerHex = (c: string): boolean => isDigit(c) || (c >= "a" && c <= "f");

/** Space, tab, newline, carriage return */
export const isWhitespace = (c: string): boolean =>
  c === " " || c === "\t" || c === "\n" || c === "\r";

export const isOneOf =
  (chars: string) =>
  (c: string): boolean =>
    chars.includes(c);
