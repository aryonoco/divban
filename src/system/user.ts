// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * User management for service accounts.
 * Creates isolated users with proper subuid/subgid configuration.
 */

import { getServiceUsername } from "../config/schema";
import { DivbanError, ErrorCode } from "../lib/errors";
import { None, type Option, Some } from "../lib/option";
import { SYSTEM_PATHS, userHomeDir } from "../lib/paths";
import { Err, Ok, type Result, mapErr, mapResult, retry } from "../lib/result";
import type { AbsolutePath, GroupId, SubordinateId, UserId, Username } from "../lib/types";
import { userIdToGroupId } from "../lib/types";
import { exec, execSuccess } from "./exec";
import { atomicWrite, readFileOrEmpty } from "./fs";
import { withLock } from "./lock";
import {
  SUBUID_RANGE,
  type UidAllocationSettings,
  allocateSubuidRange,
  allocateUid,
  getExistingSubuidStart,
  getNologinShell,
  getUidByUsername,
  userExists,
} from "./uid-allocator";

/**
 * Verify existing user has correct configuration.
 * Checks UID, home directory, and shell match expectations.
 */
const verifyUserConfig = async (
  username: Username,
  expectedHome: AbsolutePath,
  expectedUid: UserId
): Promise<Result<void, DivbanError>> => {
  const result = await exec(["getent", "passwd", username], { captureStdout: true });
  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.USER_CREATE_FAILED,
        `Failed to verify user ${username}: ${result.error.message}`,
        result.error
      )
    );
  }

  const parts = result.value.stdout.trim().split(":");
  if (parts.length < 7) {
    return Err(
      new DivbanError(ErrorCode.USER_CREATE_FAILED, `Invalid passwd entry for ${username}`)
    );
  }

  const passwdUid = parts[2];
  const homeDir = parts[5];
  const shell = parts[6];

  // Verify UID matches
  if (Number(passwdUid) !== expectedUid) {
    return Err(
      new DivbanError(
        ErrorCode.USER_CREATE_FAILED,
        `User ${username} exists with UID ${passwdUid}, expected ${expectedUid}`
      )
    );
  }

  // Verify home directory matches
  if (homeDir !== expectedHome) {
    return Err(
      new DivbanError(
        ErrorCode.USER_CREATE_FAILED,
        `User ${username} has home ${homeDir}, expected ${expectedHome}`
      )
    );
  }

  // Verify shell is nologin (security requirement)
  if (!(shell?.includes("nologin") || shell?.includes("false"))) {
    return Err(
      new DivbanError(
        ErrorCode.USER_CREATE_FAILED,
        `User ${username} has interactive shell ${shell}, expected nologin`
      )
    );
  }

  return Ok(undefined);
};

export interface ServiceUser {
  username: Username;
  uid: UserId;
  gid: GroupId;
  subuidStart: SubordinateId;
  subuidSize: number;
  homeDir: AbsolutePath;
}

/**
 * Check if error indicates UID conflict (already in use by concurrent process).
 */
const isUidConflictError = (error: DivbanError): boolean =>
  error.message.toLowerCase().includes("uid") &&
  (error.message.toLowerCase().includes("exists") ||
    error.message.toLowerCase().includes("already in use"));

/**
 * Execute an operation with automatic rollback on failure.
 * Returns the original error (rollback failures are logged but don't mask it).
 */
const withRollback = async <T>(
  operation: () => Promise<Result<T, DivbanError>>,
  rollback: () => Promise<Result<void, DivbanError>>,
  rollbackContext: string
): Promise<Result<T, DivbanError>> => {
  const result = await operation();
  if (result.ok) {
    return result;
  }

  // Attempt rollback, log failures but preserve original error
  const rollbackResult = await rollback();
  if (!rollbackResult.ok) {
    console.error(`Rollback warning (${rollbackContext}): ${rollbackResult.error.message}`);
  }
  return result;
};

/**
 * Attempt cleanup, logging failures but not propagating errors.
 * Used for secondary cleanup that shouldn't fail the main operation.
 */
const cleanupWithWarning = async (
  cleanup: () => Promise<Result<void, DivbanError>>,
  context: string
): Promise<void> => {
  const result = await cleanup();
  if (!result.ok) {
    console.warn(`Warning: ${context}: ${result.error.message}`);
  }
};

/**
 * Create a service user with dynamically allocated UID.
 * Username is derived from service name: divban-<service>
 * UID is allocated from range 10000-59999
 * Subuid range is allocated to avoid conflicts
 */
export const createServiceUser = async (
  serviceName: string,
  settings?: UidAllocationSettings
): Promise<Result<ServiceUser, DivbanError>> => {
  // Derive username from service name
  const usernameResult = getServiceUsername(serviceName);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  const homeDir = userHomeDir(username);

  // 1. Check if user already exists (idempotent with verification)
  if (await userExists(username)) {
    const uidResult = await getUidByUsername(username);
    if (!uidResult.ok) {
      return uidResult;
    }

    // Verify existing user configuration is correct
    const verifyResult = await verifyUserConfig(username, homeDir, uidResult.value);
    if (!verifyResult.ok) {
      return verifyResult;
    }

    const subuidResult = await getExistingSubuidStart(username);
    if (!subuidResult.ok) {
      return subuidResult;
    }

    return Ok({
      username,
      uid: uidResult.value,
      gid: userIdToGroupId(uidResult.value),
      subuidStart: subuidResult.value,
      subuidSize: SUBUID_RANGE.size,
      homeDir,
    });
  }

  // 2. Get nologin shell (auto-detected per distro)
  const shell = await getNologinShell();

  // 3. Allocate UID and create user with retry on UID conflict
  const userResult = await retry(
    async () => {
      const uidResult = await allocateUid(settings);
      if (!uidResult.ok) {
        return uidResult;
      }
      const uid = uidResult.value;

      const createResult = await execSuccess([
        "useradd",
        "--uid",
        String(uid),
        "--home-dir",
        homeDir,
        "--create-home",
        "--shell",
        shell,
        "--comment",
        `divban service - ${serviceName}`,
        username,
      ]);

      return mapResult(
        mapErr(
          createResult,
          (err) =>
            new DivbanError(
              ErrorCode.USER_CREATE_FAILED,
              `Failed to create user ${username}: ${err.message}`,
              err
            )
        ),
        () => uid
      );
    },
    isUidConflictError,
    { maxAttempts: 3, baseDelayMs: 50 }
  );

  if (!userResult.ok) {
    return userResult;
  }
  const uid = userResult.value;

  // === POINT OF NO RETURN: User created, rollback on subsequent failure ===
  const rollbackUser = (): Promise<Result<void, DivbanError>> => deleteServiceUser(serviceName);

  // 4. Dynamically allocate next available subuid range (with rollback)
  const subuidResult = await withRollback(
    () => allocateSubuidRange(settings?.subuidRangeSize ?? SUBUID_RANGE.size, settings),
    rollbackUser,
    `deleting user ${username} after subuid allocation failure`
  );
  if (!subuidResult.ok) {
    return subuidResult;
  }
  const subuidAlloc = subuidResult.value;

  // 5. Configure subuid/subgid (with rollback)
  const subuidConfigResult = await withRollback(
    () => configureSubordinateIds(username, subuidAlloc.start, subuidAlloc.size),
    rollbackUser,
    `deleting user ${username} after subuid config failure`
  );
  if (!subuidConfigResult.ok) {
    return subuidConfigResult;
  }

  return Ok({
    username,
    uid,
    gid: userIdToGroupId(uid),
    subuidStart: subuidAlloc.start,
    subuidSize: subuidAlloc.size,
    homeDir,
  });
};

/**
 * Atomically append entry to subuid/subgid file if not already present.
 */
const appendSubidEntry = async (
  file: AbsolutePath,
  username: Username,
  entry: string
): Promise<Result<void, DivbanError>> => {
  const content = await readFileOrEmpty(file);

  // Already configured - return success (idempotent)
  if (content.includes(`${username}:`)) {
    return Ok(undefined);
  }

  // Atomic write entire file with appended entry
  return mapErr(
    await atomicWrite(file, content + entry),
    (e) => new DivbanError(ErrorCode.SUBUID_CONFIG_FAILED, `Failed to configure ${file}`, e)
  );
};

/**
 * Configure subordinate UIDs and GIDs for a user.
 * Uses atomic writes and locking to prevent race conditions.
 */
export const configureSubordinateIds = (
  username: Username,
  start: SubordinateId,
  range: number
): Promise<Result<void, DivbanError>> => {
  return withLock("subid-config", async () => {
    const entry = `${username}:${start}:${range}\n`;

    // Re-read files after acquiring lock to ensure consistency
    const subuidResult = await appendSubidEntry(
      SYSTEM_PATHS.subuid as AbsolutePath,
      username,
      entry
    );
    if (!subuidResult.ok) {
      return subuidResult;
    }

    return appendSubidEntry(SYSTEM_PATHS.subgid as AbsolutePath, username, entry);
  });
};

/**
 * Remove a single user entry from a subid file.
 * Idempotent - returns Ok if entry doesn't exist.
 */
const removeSubidEntry = async (
  file: AbsolutePath,
  username: Username
): Promise<Result<void, DivbanError>> => {
  const content = await readFileOrEmpty(file);

  // If no entry exists, success (idempotent)
  if (!content.includes(`${username}:`)) {
    return Ok(undefined);
  }

  // Filter out the user's line(s)
  const filtered = content
    .split("\n")
    .filter((line) => !line.startsWith(`${username}:`))
    .join("\n");

  // Preserve trailing newline if content remains
  const newContent = filtered.trim() ? `${filtered.trimEnd()}\n` : "";

  return mapErr(
    await atomicWrite(file, newContent),
    (e) =>
      new DivbanError(
        ErrorCode.SUBUID_CONFIG_FAILED,
        `Failed to remove ${username} from ${file}`,
        e
      )
  );
};

/**
 * Remove a user's entries from /etc/subuid and /etc/subgid.
 * Used for rollback on partial failure and user deletion cleanup.
 * Idempotent - returns Ok if entries don't exist.
 */
const removeSubordinateIds = (username: Username): Promise<Result<void, DivbanError>> => {
  return withLock("subid-config", async () => {
    const subuidResult = await removeSubidEntry(SYSTEM_PATHS.subuid as AbsolutePath, username);
    if (!subuidResult.ok) {
      return subuidResult;
    }

    return removeSubidEntry(SYSTEM_PATHS.subgid as AbsolutePath, username);
  });
};

/**
 * Get user information if they exist.
 */
export const getServiceUser = async (
  serviceName: string
): Promise<Result<Option<ServiceUser>, DivbanError>> => {
  const usernameResult = getServiceUsername(serviceName);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  if (!(await userExists(username))) {
    return Ok(None);
  }

  const uidResult = await getUidByUsername(username);
  if (!uidResult.ok) {
    return uidResult;
  }

  const subuidResult = await getExistingSubuidStart(username);
  // If subuid not found, user may exist but not be fully configured
  const subuidStart = subuidResult.ok ? subuidResult.value : (SUBUID_RANGE.start as SubordinateId);

  return Ok(
    Some({
      username,
      uid: uidResult.value,
      gid: userIdToGroupId(uidResult.value),
      subuidStart,
      subuidSize: SUBUID_RANGE.size,
      homeDir: userHomeDir(username),
    })
  );
};

/**
 * Delete a service user and their home directory.
 * Also cleans up /etc/subuid and /etc/subgid entries.
 * Idempotent - returns Ok if user doesn't exist.
 */
export const deleteServiceUser = async (
  serviceName: string
): Promise<Result<void, DivbanError>> => {
  const usernameResult = getServiceUsername(serviceName);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  if (!(await userExists(username))) {
    // User doesn't exist, but still clean up any orphaned subuid/subgid entries
    await cleanupWithWarning(
      () => removeSubordinateIds(username),
      `Failed to clean orphaned subuid/subgid for ${username}`
    );
    return Ok(undefined);
  }

  // Delete the user account and home directory
  const deleteResult = await execSuccess(["userdel", "--remove", username]);
  const deleteMapped = mapErr(
    deleteResult,
    (err) =>
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Failed to delete user ${username}: ${err.message}`,
        err
      )
  );
  if (!deleteMapped.ok) {
    return deleteMapped;
  }

  // Remove from subuid/subgid (userdel does NOT do this on all distros)
  await cleanupWithWarning(
    () => removeSubordinateIds(username),
    `User ${username} deleted, but failed to clean subuid/subgid`
  );

  return Ok(undefined);
};

/**
 * Get user information by username.
 * Returns user details if found, error otherwise.
 */
export interface UserInfo {
  username: Username;
  uid: UserId;
  gid: GroupId;
  homeDir: AbsolutePath;
}

export const getUserByName = async (username: Username): Promise<Result<UserInfo, DivbanError>> => {
  if (!(await userExists(username))) {
    return Err(new DivbanError(ErrorCode.SERVICE_NOT_FOUND, `User not found: ${username}`));
  }

  const uidResult = await getUidByUsername(username);
  if (!uidResult.ok) {
    return uidResult;
  }

  const uid = uidResult.value;
  const homeDir = userHomeDir(username);

  return Ok({
    username,
    uid,
    gid: userIdToGroupId(uid),
    homeDir,
  });
};

/**
 * Check if current process is running as root.
 */
export const isRoot = (): boolean => {
  return process.getuid?.() === 0;
};

/**
 * Require root privileges, returning an error if not root.
 */
export const requireRoot = (): Result<void, DivbanError> => {
  if (!isRoot()) {
    return Err(
      new DivbanError(
        ErrorCode.ROOT_REQUIRED,
        "This operation requires root privileges. Please run with sudo."
      )
    );
  }
  return Ok(undefined);
};
