// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Dynamic UID and subuid allocation using Effect for error handling.
 * Cross-distribution compatible using POSIX-standard mechanisms.
 */

import { Array as Arr, Effect, Either, Option, pipe } from "effect";
import {
  type SubidRange,
  findFirstAvailableUid,
  findGapForRange,
  parsePasswdUids,
  parseSubidRanges,
} from "../lib/file-parsers";

// Re-export SubidRange for public API consumers
export type { SubidRange } from "../lib/file-parsers";
import { ErrorCode, GeneralError, SystemError } from "../lib/errors";
import { SYSTEM_PATHS } from "../lib/paths";
import type { SubordinateId, UserId, Username } from "../lib/types";
import { exec, execOutput } from "./exec";
import { readFileOrEmpty } from "./fs";
import { withLock } from "./lock";

/**
 * Default UID Allocation Range: 10000-59999
 * - Below 1000: Reserved for system users (all distros)
 * - 1000-9999: Regular users (varies by distro)
 * - 10000-59999: divban service users (safe range)
 * - 60000-65533: Often reserved (nobody, nogroup, etc.)
 * - 65534: nobody (universal)
 * - 65535+: May cause issues on some systems
 */
export const DEFAULT_UID_RANGE = {
  start: 10000,
  end: 59999,
} as const;

export const DEFAULT_SUBUID_RANGE = {
  start: 100000,
  size: 65536,
  maxEnd: 4294967294,
} as const;

/** Canonical UID range constants - used throughout the codebase */
export const UID_RANGE: typeof DEFAULT_UID_RANGE = DEFAULT_UID_RANGE;
export const SUBUID_RANGE: typeof DEFAULT_SUBUID_RANGE = DEFAULT_SUBUID_RANGE;

/**
 * UID allocation settings from global config.
 */
export interface UidAllocationSettings {
  uidRangeStart: number;
  uidRangeEnd: number;
  subuidRangeStart: number;
  subuidRangeSize: number;
}

/** Pure function returning ReadonlySet (immutable type) */
const parsePasswdFile = (content: string): ReadonlySet<number> => new Set(parsePasswdUids(content));

/**
 * Fetch UIDs from multiple sources in parallel.
 * Works across all major Linux distributions.
 */
export const getUsedUids = (): Effect.Effect<ReadonlySet<number>, never> =>
  pipe(
    Effect.all({
      passwd: Effect.map(readFileOrEmpty(SYSTEM_PATHS.passwd), parsePasswdFile),
      getent: pipe(
        execOutput(["getent", "passwd"]),
        Effect.map(parsePasswdFile),
        Effect.orElseSucceed((): ReadonlySet<number> => new Set())
      ),
    }),
    Effect.map(({ passwd, getent }) => new Set([...passwd, ...getent]))
  );

/**
 * Parse subuid file into range list.
 */
export const getUsedSubuidRanges = (): Effect.Effect<readonly SubidRange[], never> =>
  Effect.map(readFileOrEmpty(SYSTEM_PATHS.subuid), parseSubidRanges);

/**
 * Allocate the next available UID in the range.
 * Uses file locking to prevent concurrent allocation conflicts.
 */
export const allocateUid = (
  settings?: UidAllocationSettings
): Effect.Effect<UserId, SystemError | GeneralError> =>
  withLock(
    "uid-allocation",
    Effect.gen(function* () {
      const start = settings?.uidRangeStart ?? DEFAULT_UID_RANGE.start;
      const end = settings?.uidRangeEnd ?? DEFAULT_UID_RANGE.end;

      // Re-read after acquiring lock to get fresh state
      const usedUids = yield* getUsedUids();

      return yield* pipe(
        findFirstAvailableUid(start, end, usedUids),
        Option.match({
          onNone: (): Effect.Effect<UserId, SystemError> =>
            Effect.fail(
              new SystemError({
                code: ErrorCode.UID_RANGE_EXHAUSTED as 24,
                message: `No available UIDs in range ${start}-${end}. All ${end - start + 1} UIDs are in use.`,
              })
            ),
          // uid is from findFirstAvailableUid which returns values in validated range [start, end]
          onSome: (uid): Effect.Effect<UserId, never> => Effect.succeed(uid as UserId),
        })
      );
    })
  );

/**
 * Internal UID allocation without lock - for use within larger locked operations.
 * MUST only be called while holding the "uid-allocation" lock.
 */
export const allocateUidInternal = (
  settings?: UidAllocationSettings
): Effect.Effect<UserId, SystemError> =>
  Effect.gen(function* () {
    const start = settings?.uidRangeStart ?? DEFAULT_UID_RANGE.start;
    const end = settings?.uidRangeEnd ?? DEFAULT_UID_RANGE.end;

    const usedUids = yield* getUsedUids();

    return yield* pipe(
      findFirstAvailableUid(start, end, usedUids),
      Option.match({
        onNone: (): Effect.Effect<UserId, SystemError> =>
          Effect.fail(
            new SystemError({
              code: ErrorCode.UID_RANGE_EXHAUSTED as 24,
              message: `No available UIDs in range ${start}-${end}. All ${end - start + 1} UIDs are in use.`,
            })
          ),
        // uid is from findFirstAvailableUid which returns values in validated range [start, end]
        onSome: (uid): Effect.Effect<UserId, never> => Effect.succeed(uid as UserId),
      })
    );
  });

/**
 * Allocate the next available subuid range that doesn't overlap
 * with existing allocations.
 * Uses file locking to prevent concurrent allocation conflicts.
 */
export const allocateSubuidRange = (
  size?: number,
  settings?: UidAllocationSettings
): Effect.Effect<{ start: SubordinateId; size: number }, SystemError | GeneralError> =>
  withLock(
    "subuid-allocation",
    Effect.gen(function* () {
      const rangeStart = settings?.subuidRangeStart ?? DEFAULT_SUBUID_RANGE.start;
      const rangeSize = size ?? settings?.subuidRangeSize ?? DEFAULT_SUBUID_RANGE.size;

      // Re-read after acquiring lock to get fresh state
      const usedRanges = yield* getUsedSubuidRanges();

      return yield* pipe(
        findGapForRange(usedRanges, rangeStart, rangeSize, DEFAULT_SUBUID_RANGE.maxEnd),
        Option.match({
          onNone: (): Effect.Effect<{ start: SubordinateId; size: number }, SystemError> =>
            Effect.fail(
              new SystemError({
                code: ErrorCode.SUBUID_RANGE_EXHAUSTED as 25,
                message: `No available subuid range of size ${rangeSize} starting from ${rangeStart}`,
              })
            ),
          // start is from findGapForRange which returns values >= rangeStart (validated)
          onSome: (start): Effect.Effect<{ start: SubordinateId; size: number }, never> =>
            Effect.succeed({ start: start as SubordinateId, size: rangeSize }),
        })
      );
    })
  );

/**
 * Get UID for an existing user by name.
 */
export const getUidByUsername = (
  username: Username
): Effect.Effect<UserId, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(execOutput(["id", "-u", username]));

    type UidResult = Effect.Effect<UserId, SystemError | GeneralError>;
    return yield* Either.match(result, {
      onLeft: (): UidResult =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `User ${username} not found`,
          })
        ),
      onRight: (output): UidResult => {
        const uid = Number.parseInt(output.trim(), 10);
        // uid is parsed from `id -u` output - validated to be a number
        return Number.isNaN(uid)
          ? Effect.fail(
              new GeneralError({
                code: ErrorCode.GENERAL_ERROR as 1,
                message: `Invalid UID for user ${username}`,
              })
            )
          : Effect.succeed(uid as UserId);
      },
    });
  });

/**
 * Check if a user exists.
 */
export const userExists = (username: Username): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(exec(["id", username]));
    return Either.match(result, {
      onLeft: (): boolean => false,
      onRight: (r): boolean => r.exitCode === 0,
    });
  });

/**
 * Get existing subuid start for a user.
 */
export const getExistingSubuidStart = (
  username: Username
): Effect.Effect<SubordinateId, GeneralError> =>
  pipe(
    getUsedSubuidRanges(),
    Effect.flatMap((ranges) =>
      pipe(
        ranges,
        Arr.findFirst((r) => r.user === username),
        Option.match({
          onNone: (): Effect.Effect<SubordinateId, GeneralError> =>
            Effect.fail(
              new GeneralError({
                code: ErrorCode.GENERAL_ERROR as 1,
                message: `No subuid range found for ${username}`,
              })
            ),
          // range.start is from parseSubidLine which validates the numeric format
          onSome: (range): Effect.Effect<SubordinateId, never> =>
            Effect.succeed(range.start as SubordinateId),
        })
      )
    )
  );

/**
 * Get nologin shell path (distribution-independent).
 */
export const getNologinShell = (): Effect.Effect<string, never> =>
  pipe(
    Effect.forEach(
      SYSTEM_PATHS.nologinPaths,
      (path) =>
        pipe(
          Effect.promise(() => Bun.file(path).exists()),
          Effect.map((exists) => ({ path, exists }))
        ),
      { concurrency: 1 } // Sequential: check in priority order
    ),
    Effect.map((results) =>
      pipe(
        results,
        Arr.findFirst((r) => r.exists),
        Option.map((r) => r.path),
        Option.getOrElse(() => "/bin/false")
      )
    )
  );
