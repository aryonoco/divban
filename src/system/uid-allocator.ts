// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Dynamic UID and subuid allocation for service users.
 * Cross-distribution compatible using POSIX-standard mechanisms.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { fromUndefined, okOr } from "../lib/option";
import { SYSTEM_PATHS } from "../lib/paths";
import { Err, Ok, type Result, mapResult } from "../lib/result";
import type { SubordinateId, UserId } from "../lib/types";
import { exec, execOutput } from "./exec";
import { readFileOrEmpty } from "./fs";

/**
 * UID Allocation Range: 10000-59999
 * - Below 1000: Reserved for system users (all distros)
 * - 1000-9999: Regular users (varies by distro)
 * - 10000-59999: divban service users (safe range)
 * - 60000-65533: Often reserved (nobody, nogroup, etc.)
 * - 65534: nobody (universal)
 * - 65535+: May cause issues on some systems
 */
export const UID_RANGE = {
  start: 10000,
  end: 59999,
} as const;

export const SUBUID_RANGE = {
  start: 100000,
  size: 65536,
  maxEnd: 4294967294,
} as const;

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
export const getUsedUids = async (): Promise<Result<Set<number>, DivbanError>> => {
  const usedUids = new Set<number>();

  // Method 1: Parse /etc/passwd directly (always available, all distros)
  const passwdContent = await readFileOrEmpty(SYSTEM_PATHS.passwd);
  for (const uid of parsePasswdFile(passwdContent)) {
    usedUids.add(uid);
  }

  // Method 2: Use getent for NSS sources (handles LDAP, NIS, SSSD)
  // Not available on musl-based distros (Alpine) - fails gracefully
  const getentResult = await execOutput(["getent", "passwd"]);
  if (getentResult.ok) {
    for (const uid of parsePasswdFile(getentResult.value)) {
      usedUids.add(uid);
    }
  }
  // Note: getent failure is not an error - Alpine doesn't have it

  return Ok(usedUids);
};

/**
 * Get all subuid ranges currently allocated.
 */
export const getUsedSubuidRanges = async (): Promise<
  Result<Array<{ user: string; start: number; end: number }>, DivbanError>
> => {
  const ranges: Array<{ user: string; start: number; end: number }> = [];

  const content = await readFileOrEmpty(SYSTEM_PATHS.subuid);
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

  return Ok(ranges);
};

/**
 * Allocate the next available UID in the range.
 */
export const allocateUid = async (): Promise<Result<UserId, DivbanError>> => {
  const usedResult = await getUsedUids();
  if (!usedResult.ok) {
    return usedResult;
  }

  const usedUids = usedResult.value;

  for (let uid = UID_RANGE.start; uid <= UID_RANGE.end; uid++) {
    if (!usedUids.has(uid)) {
      return Ok(uid as UserId);
    }
  }

  return Err(
    new DivbanError(
      ErrorCode.UID_RANGE_EXHAUSTED,
      `No available UIDs in range ${UID_RANGE.start}-${UID_RANGE.end}. ` +
        `All ${UID_RANGE.end - UID_RANGE.start + 1} UIDs are in use.`
    )
  );
};

/**
 * Allocate the next available subuid range that doesn't overlap
 * with existing allocations.
 */
export const allocateSubuidRange = async (
  size: number = SUBUID_RANGE.size
): Promise<Result<{ start: SubordinateId; size: number }, DivbanError>> => {
  const rangesResult = await getUsedSubuidRanges();
  if (!rangesResult.ok) {
    return rangesResult;
  }

  const usedRanges = rangesResult.value.sort((a, b) => a.start - b.start);

  let candidate = SUBUID_RANGE.start;

  for (const range of usedRanges) {
    // Check if candidate range fits before this used range
    if (candidate + size - 1 < range.start) {
      return Ok({ start: candidate as SubordinateId, size });
    }
    // Move candidate past this used range
    candidate = Math.max(candidate, range.end + 1) as typeof SUBUID_RANGE.start;
  }

  // Check if candidate fits after all used ranges
  if (candidate + size - 1 <= SUBUID_RANGE.maxEnd) {
    return Ok({ start: candidate as SubordinateId, size });
  }

  return Err(
    new DivbanError(
      ErrorCode.SUBUID_RANGE_EXHAUSTED,
      `No available subuid range of size ${size} starting from ${SUBUID_RANGE.start}`
    )
  );
};

/**
 * Get UID for an existing user by name.
 */
export const getUidByUsername = async (username: string): Promise<Result<UserId, DivbanError>> => {
  const result = await execOutput(["id", "-u", username]);

  if (!result.ok) {
    return Err(new DivbanError(ErrorCode.GENERAL_ERROR, `User ${username} not found`));
  }

  const uid = Number.parseInt(result.value.trim(), 10);
  if (Number.isNaN(uid)) {
    return Err(new DivbanError(ErrorCode.GENERAL_ERROR, `Invalid UID for user ${username}`));
  }

  return Ok(uid as UserId);
};

/**
 * Check if a user exists.
 */
export const userExists = async (username: string): Promise<boolean> => {
  const result = await exec(["id", username]);
  return result.ok && result.value.exitCode === 0;
};

/**
 * Get existing subuid start for a user.
 */
export const getExistingSubuidStart = async (
  username: string
): Promise<Result<SubordinateId, DivbanError>> => {
  const rangesResult = await getUsedSubuidRanges();
  if (!rangesResult.ok) {
    return rangesResult;
  }

  const rangeOpt = fromUndefined(rangesResult.value.find((r) => r.user === username));
  return mapResult(
    okOr(
      rangeOpt,
      new DivbanError(ErrorCode.GENERAL_ERROR, `No subuid range found for ${username}`)
    ),
    (range) => range.start as SubordinateId
  );
};

/**
 * Get nologin shell path (distribution-independent).
 */
export const getNologinShell = async (): Promise<string> => {
  // Check standard nologin locations first
  for (const path of SYSTEM_PATHS.nologinPaths) {
    const file = Bun.file(path);
    if (await file.exists()) {
      return path;
    }
  }

  // Fallback (POSIX)
  return "/bin/false";
};
