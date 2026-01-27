// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * String operations at the character level. Uses `Array.from()` throughout
 * for correct Unicode surrogate pair handling (string indexing does not).
 * All multi argument functions are curried data-last for `pipe()` composition.
 */

import { Option } from "effect";
import type { CharPred } from "./char";

export const chars = (s: string): readonly string[] => Array.from(s);

/** Split into `[head, tail]`, returning `None` for empty strings. */
export const uncons = (s: string): Option.Option<readonly [string, string]> => {
	const arr = chars(s);
	const first = arr[0];
	return first !== undefined
		? Option.some([first, arr.slice(1).join("")] as const)
		: Option.none();
};

export const last = (s: string): Option.Option<string> =>
	Option.fromNullable(chars(s).at(-1));

/** Lift a `CharPred` to operate on an entire string (every character must satisfy). */
export const all =
	(pred: CharPred) =>
	(s: string): boolean =>
		chars(s).every(pred);

export const mapCharsToString =
	(f: (c: string) => string) =>
	(s: string): string =>
		Array.from(s).map(f).join("");

export const filterCharsToString =
	(pred: CharPred) =>
	(s: string): string =>
		Array.from(s).filter(pred).join("");

/** Remove consecutive duplicates of `char` (e.g. collapse `//` → `/`). */
export const collapseChar =
	(char: string) =>
	(s: string): string => {
		const arr = Array.from(s);
		return arr.filter((c, i) => c !== char || arr[i - 1] !== char).join("");
	};

/** Replace characters via a lookup map, passing through unmapped characters. */
export const escapeWith = (
	mapping: ReadonlyMap<string, string>,
): ((s: string) => string) => mapCharsToString((c) => mapping.get(c) ?? c);
