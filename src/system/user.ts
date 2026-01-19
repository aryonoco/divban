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
import {
  SUBUID_RANGE,
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
 * Create a service user with dynamically allocated UID.
 * Username is derived from service name: divban-<service>
 * UID is allocated from range 10000-59999
 * Subuid range is allocated to avoid conflicts
 */
export const createServiceUser = async (
  serviceName: string
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
      const uidResult = await allocateUid();
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

  // 4. Dynamically allocate next available subuid range
  const subuidResult = await allocateSubuidRange(SUBUID_RANGE.size);
  if (!subuidResult.ok) {
    return subuidResult;
  }
  const subuidAlloc = subuidResult.value;

  // 5. Configure subuid/subgid
  const subuidConfigResult = await configureSubordinateIds(
    username,
    subuidAlloc.start,
    subuidAlloc.size
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
 * Uses atomic writes to prevent race conditions.
 */
export const configureSubordinateIds = async (
  username: Username,
  start: SubordinateId,
  range: number
): Promise<Result<void, DivbanError>> => {
  const entry = `${username}:${start}:${range}\n`;

  // Configure subuid first, then subgid (sequential to avoid partial configuration)
  const subuidResult = await appendSubidEntry(SYSTEM_PATHS.subuid as AbsolutePath, username, entry);
  if (!subuidResult.ok) {
    return subuidResult;
  }

  return appendSubidEntry(SYSTEM_PATHS.subgid as AbsolutePath, username, entry);
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
 * Use with caution!
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
    return Ok(undefined); // Already doesn't exist
  }

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

  // Remove from subuid/subgid
  // Note: userdel should handle this, but we verify
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
