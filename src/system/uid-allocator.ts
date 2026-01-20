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

import { Effect } from "effect";
import { ErrorCode, GeneralError, SystemError } from "../lib/errors";
import { SYSTEM_PATHS } from "../lib/paths";
import type { SubordinateId, UserId } from "../lib/types";
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

// Keep old names as aliases for backwards compatibility in tests
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

/**
 * Parse /etc/passwd file and extract UIDs.
 */
const parsePasswdFile = (content: string): Set<number> => {
  const uids = new Set<number>();

  for (const line of content.split("\n")) {
    if (!line.trim() || line.startsWith("#")) {
      continue;
    }
    const parts = line.split(":");
    const uid = Number.parseInt(parts[2] ?? "", 10);
    if (!Number.isNaN(uid)) {
      uids.add(uid);
    }
  }

  return uids;
};

/**
 * Get all UIDs currently in use on the system.
 * Works across all major Linux distributions.
 */
export const getUsedUids = (): Effect.Effect<Set<number>, never> =>
  Effect.gen(function* () {
    const usedUids = new Set<number>();

    // Method 1: Parse /etc/passwd directly (always available, all distros)
    const passwdContent = yield* readFileOrEmpty(SYSTEM_PATHS.passwd);
    for (const uid of parsePasswdFile(passwdContent)) {
      usedUids.add(uid);
    }

    // Method 2: Use getent for NSS sources (handles LDAP, NIS, SSSD)
    // Not available on musl-based distros (Alpine) - fails gracefully
    const getentResult = yield* Effect.either(execOutput(["getent", "passwd"]));
    if (getentResult._tag === "Right") {
      for (const uid of parsePasswdFile(getentResult.right)) {
        usedUids.add(uid);
      }
    }
    // Note: getent failure is not an error - Alpine doesn't have it

    return usedUids;
  });

/**
 * Get all subuid ranges currently allocated.
 */
export const getUsedSubuidRanges = (): Effect.Effect<
  Array<{ user: string; start: number; end: number }>,
  never
> =>
  Effect.gen(function* () {
    const ranges: Array<{ user: string; start: number; end: number }> = [];

    const content = yield* readFileOrEmpty(SYSTEM_PATHS.subuid);
    for (const line of content.split("\n")) {
      if (!line.trim() || line.startsWith("#")) {
        continue;
      }
      const [user, startStr, countStr] = line.split(":");
      const start = Number.parseInt(startStr ?? "", 10);
      const count = Number.parseInt(countStr ?? "", 10);
      if (user && !Number.isNaN(start) && !Number.isNaN(count)) {
        ranges.push({ user, start, end: start + count - 1 });
      }
    }

    return ranges;
  });

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

      for (let uid = start; uid <= end; uid++) {
        if (!usedUids.has(uid)) {
          return uid as UserId;
        }
      }

      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.UID_RANGE_EXHAUSTED as 24,
          message: `No available UIDs in range ${start}-${end}. All ${end - start + 1} UIDs are in use.`,
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

    for (let uid = start; uid <= end; uid++) {
      if (!usedUids.has(uid)) {
        return uid as UserId;
      }
    }

    return yield* Effect.fail(
      new SystemError({
        code: ErrorCode.UID_RANGE_EXHAUSTED as 24,
        message: `No available UIDs in range ${start}-${end}. All ${end - start + 1} UIDs are in use.`,
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
      const usedRanges = (yield* getUsedSubuidRanges()).sort((a, b) => a.start - b.start);

      let candidate = rangeStart;

      for (const range of usedRanges) {
        // Check if candidate range fits before this used range
        if (candidate + rangeSize - 1 < range.start) {
          return { start: candidate as SubordinateId, size: rangeSize };
        }
        // Move candidate past this used range
        candidate = Math.max(candidate, range.end + 1);
      }

      // Check if candidate fits after all used ranges
      if (candidate + rangeSize - 1 <= DEFAULT_SUBUID_RANGE.maxEnd) {
        return { start: candidate as SubordinateId, size: rangeSize };
      }

      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.SUBUID_RANGE_EXHAUSTED as 25,
          message: `No available subuid range of size ${rangeSize} starting from ${rangeStart}`,
        })
      );
    })
  );

/**
 * Get UID for an existing user by name.
 */
export const getUidByUsername = (
  username: string
): Effect.Effect<UserId, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(execOutput(["id", "-u", username]));

    if (result._tag === "Left") {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `User ${username} not found`,
        })
      );
    }

    const uid = Number.parseInt(result.right.trim(), 10);
    if (Number.isNaN(uid)) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `Invalid UID for user ${username}`,
        })
      );
    }

    return uid as UserId;
  });

/**
 * Check if a user exists.
 */
export const userExists = (username: string): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(exec(["id", username]));
    return result._tag === "Right" && result.right.exitCode === 0;
  });

/**
 * Get existing subuid start for a user.
 */
export const getExistingSubuidStart = (
  username: string
): Effect.Effect<SubordinateId, GeneralError> =>
  Effect.gen(function* () {
    const ranges = yield* getUsedSubuidRanges();

    const range = ranges.find((r) => r.user === username);
    if (range === undefined) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `No subuid range found for ${username}`,
        })
      );
    }

    return range.start as SubordinateId;
  });

/**
 * Get nologin shell path (distribution-independent).
 */
export const getNologinShell = (): Effect.Effect<string, never> =>
  Effect.promise(async () => {
    // Check standard nologin locations first
    for (const path of SYSTEM_PATHS.nologinPaths) {
      const file = Bun.file(path);
      if (await file.exists()) {
        return path;
      }
    }

    // Fallback (POSIX)
    return "/bin/false";
  });
