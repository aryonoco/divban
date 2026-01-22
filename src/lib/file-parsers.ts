// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Pure parsing utilities for text file formats.
 * Functional core: no side effects, easy to unit test.
 */

import { Array as Arr, Option, Order, pipe } from "effect";

// ============================================================================
// Line Parsing Combinators
// ============================================================================

/** Predicate: line is non-empty and not a comment */
const isContentLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith("#");
};

/** Filter out empty and comment lines */
export const filterContentLines = (lines: readonly string[]): readonly string[] =>
  Arr.filter(lines, isContentLine);

/** Split content into content lines */
export const toContentLines = (content: string): readonly string[] =>
  filterContentLines(content.split("\n"));

// ============================================================================
// KEY=VALUE Parsing
// ============================================================================

/**
 * Parse KEY=VALUE format.
 * Total: returns empty record for invalid input.
 * Used by: age.ts
 */
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

// ============================================================================
// Colon-Delimited Parsing (passwd, subuid format)
// ============================================================================

/**
 * Parse colon-delimited lines.
 * Higher-order: takes a parser for the field array.
 * noUncheckedIndexedAccess-safe: parser receives readonly string[],
 * must use Arr.get for index access.
 */
export const parseColonDelimited = <T>(
  content: string,
  parse: (fields: readonly string[]) => Option.Option<T>
): readonly T[] =>
  pipe(
    content.split("\n"),
    Arr.filter(isContentLine),
    Arr.filterMap((line) => parse(line.split(":")))
  );

/**
 * Extract UIDs from passwd-format content.
 * Uses Arr.get for noUncheckedIndexedAccess compliance.
 */
export const parsePasswdUids = (content: string): readonly number[] =>
  parseColonDelimited(content, (fields) =>
    pipe(
      Arr.get(fields, 2), // UID field, returns Option<string>
      Option.map((s) => Number.parseInt(s, 10)),
      Option.filter((n) => !Number.isNaN(n))
    )
  );

// ============================================================================
// Subuid/Subgid Range ADT
// ============================================================================

/** Subuid/subgid range ADT */
export interface SubidRange {
  readonly user: string;
  readonly start: number;
  readonly end: number;
}

/** Order instance for SubidRange by start position */
export const SubidRangeOrd: Order.Order<SubidRange> = Order.mapInput(
  Order.number,
  (r: SubidRange) => r.start
);

/**
 * Parse subuid/subgid ranges.
 * Uses Arr.get for noUncheckedIndexedAccess compliance.
 */
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

// ============================================================================
// UID Allocation Pure Functions
// ============================================================================

/**
 * Find first available UID in range.
 * Pure function - no effects.
 * Uses Arr.findFirst which returns Option (total, not partial).
 */
export const findFirstAvailableUid = (
  start: number,
  end: number,
  used: ReadonlySet<number>
): Option.Option<number> =>
  pipe(
    Arr.range(start, end),
    Arr.findFirst((n) => !used.has(n))
  );

/** Accumulator state for gap-finding fold */
interface GapSearchState {
  readonly candidate: number;
  readonly found: Option.Option<number>;
}

/**
 * Find gap in sorted ranges for new allocation.
 * Pure fold with early exit via Option.isSome check.
 */
export const findGapForRange = (
  ranges: readonly SubidRange[],
  rangeStart: number,
  rangeSize: number,
  maxEnd: number
): Option.Option<number> => {
  const sorted = Arr.sort(ranges, SubidRangeOrd);
  const initial: GapSearchState = { candidate: rangeStart, found: Option.none() };

  const step = (acc: GapSearchState, range: SubidRange): GapSearchState => {
    // Short-circuit: already found
    if (Option.isSome(acc.found)) {
      return acc;
    }
    // Gap found before current range
    if (acc.candidate + rangeSize - 1 < range.start) {
      return { candidate: acc.candidate, found: Option.some(acc.candidate) };
    }
    // Move candidate past current range
    return { candidate: Math.max(acc.candidate, range.end + 1), found: Option.none() };
  };

  const { candidate, found } = Arr.reduce(sorted, initial, step);

  // Check if gap exists after all ranges
  if (Option.isSome(found)) {
    return found;
  }
  return candidate + rangeSize - 1 <= maxEnd ? Option.some(candidate) : Option.none();
};
