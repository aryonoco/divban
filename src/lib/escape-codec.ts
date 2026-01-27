// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Bidirectional escape codec. A single `(original, trigger)` pair list
 * derives both escape and unescape, guaranteeing round-trip identity:
 * `unescape(escape(s)) === s` for all inputs containing mapped characters.
 */

import { Array as Arr, Match, pipe } from "effect";

import { escapeWith } from "./str";

export interface EscapeCodec {
  readonly escape: (s: string) => string;
  readonly unescape: (s: string) => string;
}

const mkUnescape =
  (prefix: string, mapping: ReadonlyMap<string, string>) =>
  (s: string): string => {
    const step = (escaped: boolean, c: string): [boolean, string] =>
      pipe(
        Match.value(escaped),
        Match.when(true, (): [boolean, string] => [false, mapping.get(c) ?? c]),
        Match.when(false, (): [boolean, string] =>
          pipe(
            Match.value(c === prefix),
            Match.when(true, (): [boolean, string] => [true, ""]),
            Match.when(false, (): [boolean, string] => [false, c]),
            Match.exhaustive
          )
        ),
        Match.exhaustive
      );
    const [, mapped] = Arr.mapAccum(Array.from(s), false, step);
    return mapped.join("");
  };

/**
 * Build a codec from a prefix character and `[original, trigger]` pairs.
 * Both maps are derived from the same pair list to prevent drift.
 */
export const makeEscapeCodec = (
  prefix: string,
  pairs: ReadonlyArray<readonly [original: string, trigger: string]>
): EscapeCodec => {
  const escapeMap: ReadonlyMap<string, string> = new Map(
    pairs.map(([original, trigger]) => [original, `${prefix}${trigger}`])
  );

  const unescapeMap: ReadonlyMap<string, string> = new Map(
    pairs.map(([original, trigger]) => [trigger, original])
  );

  return {
    escape: escapeWith(escapeMap),
    unescape: mkUnescape(prefix, unescapeMap),
  };
};

/** Shared by quadlet INI and Caddyfile formatters. */
export const quoteEscapeCodec: EscapeCodec = makeEscapeCodec("\\", [['"', '"']]);

/** Covers all shell-sensitive characters in environment file values. */
export const envEscapeCodec: EscapeCodec = makeEscapeCodec("\\", [
  ["\\", "\\"],
  ['"', '"'],
  ["$", "$"],
  ["`", "`"],
  ["\n", "n"],
]);
