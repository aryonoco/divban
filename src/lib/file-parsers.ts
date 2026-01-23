// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Parsers for /etc/passwd and /etc/subuid needed by UID allocation.
 * Uses Option-returning parsers for safety with noUncheckedIndexedAccess.
 * Pure functions with no IO - callers handle file reading.
 */

import { Array as Arr, Match, Option, Order, pipe } from "effect";

const isContentLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith("#");
};

export const filterContentLines = (lines: readonly string[]): readonly string[] =>
  Arr.filter(lines, isContentLine);

export const toContentLines = (content: string): readonly string[] =>
  filterContentLines(content.split("\n"));

/** Used by: age.ts for parsing key files. */
export const parseKeyValue = (content: string): Record<string, string> =>
  pipe(
    content.split("\n"),
    Arr.map((line) => line.trim()),
    Arr.filter(isContentLine),
    Arr.filterMap((line) => {
      const eqIndex = line.indexOf("=");
      return eqIndex > 0
        ? Option.some([line.slice(0, eqIndex), line.slice(eqIndex + 1)] as const)
        : Option.none();
    }),
    Object.fromEntries
  );

export const parseColonDelimited = <T>(
  content: string,
  parse: (fields: readonly string[]) => Option.Option<T>
): readonly T[] =>
  pipe(
    content.split("\n"),
    Arr.filter(isContentLine),
    Arr.filterMap((line) => parse(line.split(":")))
  );

export const parsePasswdUids = (content: string): readonly number[] =>
  parseColonDelimited(content, (fields) =>
    pipe(
      Arr.get(fields, 2), // UID field, returns Option<string>
      Option.map((s) => Number.parseInt(s, 10)),
      Option.filter((n) => !Number.isNaN(n))
    )
  );

export interface SubidRange {
  readonly user: string;
  readonly start: number;
  readonly end: number;
}

export const SubidRangeOrd: Order.Order<SubidRange> = Order.mapInput(
  Order.number,
  (r: SubidRange) => r.start
);

export const parseSubidRanges = (content: string): readonly SubidRange[] =>
  parseColonDelimited(content, (fields) =>
    pipe(
      Option.all({
        user: Arr.get(fields, 0),
        startStr: Arr.get(fields, 1),
        countStr: Arr.get(fields, 2),
      }),
      Option.flatMap(({ user, startStr, countStr }) => {
        const start = Number.parseInt(startStr, 10);
        const count = Number.parseInt(countStr, 10);
        return Number.isNaN(start) || Number.isNaN(count)
          ? Option.none()
          : Option.some({ user, start, end: start + count - 1 });
      })
    )
  );

export const findFirstAvailableUid = (
  start: number,
  end: number,
  used: ReadonlySet<number>
): Option.Option<number> =>
  pipe(
    Arr.range(start, end),
    Arr.findFirst((n) => !used.has(n))
  );

interface GapSearchState {
  readonly candidate: number;
  readonly found: Option.Option<number>;
}

export const findGapForRange = (
  ranges: readonly SubidRange[],
  rangeStart: number,
  rangeSize: number,
  maxEnd: number
): Option.Option<number> => {
  const sorted = Arr.sort(ranges, SubidRangeOrd);
  const initial: GapSearchState = { candidate: rangeStart, found: Option.none() };

  const step = (acc: GapSearchState, range: SubidRange): GapSearchState =>
    Option.match(acc.found, {
      // Short-circuit: already found
      onSome: (): GapSearchState => acc,
      onNone: (): GapSearchState =>
        pipe(
          Match.value(acc.candidate + rangeSize - 1 < range.start),
          // Gap found before current range
          Match.when(true, () => ({ candidate: acc.candidate, found: Option.some(acc.candidate) })),
          // Move candidate past current range
          Match.when(false, () => ({
            candidate: Math.max(acc.candidate, range.end + 1),
            found: Option.none(),
          })),
          Match.exhaustive
        ),
    });

  const { candidate, found } = Arr.reduce(sorted, initial, step);

  // Check if gap exists after all ranges
  return Option.match(found, {
    onSome: (): Option.Option<number> => found,
    onNone: (): Option.Option<number> =>
      pipe(
        Match.value(candidate + rangeSize - 1 <= maxEnd),
        Match.when(true, () => Option.some(candidate)),
        Match.when(false, () => Option.none()),
        Match.exhaustive
      ),
  });
};
