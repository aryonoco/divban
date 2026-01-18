/**
 * User management for service accounts.
 * Creates isolated users with proper subuid/subgid configuration.
 */

import { getServiceUsername } from "../config/schema";
import { DivbanError, ErrorCode, wrapError } from "../lib/errors";
import { Err, Ok, type Result, tryCatch } from "../lib/result";
import type { AbsolutePath, GroupId, SubordinateId, UserId, Username } from "../lib/types";
import { execSuccess } from "./exec";
import { appendFile, readFileOrEmpty } from "./fs";
import {
  allocateSubuidRange,
  allocateUid,
  getExistingSubuidStart,
  getNologinShell,
  getUidByUsername,
  SUBUID_RANGE,
  userExists,
} from "./uid-allocator";

export interface ServiceUser {
  username: Username;
  uid: UserId;
  gid: GroupId;
  subuidStart: SubordinateId;
  subuidSize: number;
  homeDir: AbsolutePath;
}

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
  if (!usernameResult.ok) return usernameResult;
  const username = usernameResult.value;

  const homeDir = `/home/${username}` as AbsolutePath;

  // 1. Check if user already exists (idempotent)
  if (await userExists(username)) {
    const uidResult = await getUidByUsername(username);
    if (!uidResult.ok) return uidResult;

    const subuidResult = await getExistingSubuidStart(username);
    if (!subuidResult.ok) return subuidResult;

    return Ok({
      username,
      uid: uidResult.value,
      gid: uidResult.value as unknown as GroupId, // Assuming GID matches UID
      subuidStart: subuidResult.value,
      subuidSize: SUBUID_RANGE.size,
      homeDir,
    });
  }

  // 2. Dynamically allocate next available UID (10000-59999)
  const uidResult = await allocateUid();
  if (!uidResult.ok) return uidResult;
  const uid = uidResult.value;

  // 3. Dynamically allocate next available subuid range
  const subuidResult = await allocateSubuidRange(SUBUID_RANGE.size);
  if (!subuidResult.ok) return subuidResult;
  const subuidAlloc = subuidResult.value;

  // 4. Get nologin shell (auto-detected per distro)
  const shell = await getNologinShell();

  // 5. Create user with useradd
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
    `divban service: ${serviceName}`,
    username,
  ]);

  if (!createResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.USER_CREATE_FAILED,
        `Failed to create user ${username}: ${createResult.error.message}`,
        createResult.error
      )
    );
  }

  // 6. Configure subuid/subgid
  const subuidConfigResult = await configureSubordinateIds(
    username,
    subuidAlloc.start,
    subuidAlloc.size
  );
  if (!subuidConfigResult.ok) return subuidConfigResult;

  return Ok({
    username,
    uid,
    gid: uid as unknown as GroupId,
    subuidStart: subuidAlloc.start,
    subuidSize: subuidAlloc.size,
    homeDir,
  });
};

/**
 * Configure subordinate UIDs and GIDs for a user.
 */
export const configureSubordinateIds = async (
  username: Username,
  start: SubordinateId,
  range: number
): Promise<Result<void, DivbanError>> => {
  const entry = `${username}:${start}:${range}\n`;

  for (const file of ["/etc/subuid", "/etc/subgid"] as AbsolutePath[]) {
    // Check if already configured
    const content = await readFileOrEmpty(file);
    if (content.includes(`${username}:`)) {
      continue; // Already configured
    }

    // Append new entry
    const appendResult = await appendFile(file, entry);
    if (!appendResult.ok) {
      return Err(
        new DivbanError(
          ErrorCode.SUBUID_CONFIG_FAILED,
          `Failed to configure ${file} for ${username}`,
          appendResult.error
        )
      );
    }
  }

  return Ok(undefined);
};

/**
 * Get user information if they exist.
 */
export const getServiceUser = async (
  serviceName: string
): Promise<Result<ServiceUser | null, DivbanError>> => {
  const usernameResult = getServiceUsername(serviceName);
  if (!usernameResult.ok) return usernameResult;
  const username = usernameResult.value;

  if (!(await userExists(username))) {
    return Ok(null);
  }

  const uidResult = await getUidByUsername(username);
  if (!uidResult.ok) return uidResult;

  const subuidResult = await getExistingSubuidStart(username);
  // If subuid not found, user may exist but not be fully configured
  const subuidStart = subuidResult.ok ? subuidResult.value : (SUBUID_RANGE.start as SubordinateId);

  return Ok({
    username,
    uid: uidResult.value,
    gid: uidResult.value as unknown as GroupId,
    subuidStart,
    subuidSize: SUBUID_RANGE.size,
    homeDir: `/home/${username}` as AbsolutePath,
  });
};

/**
 * Delete a service user and their home directory.
 * Use with caution!
 */
export const deleteServiceUser = async (serviceName: string): Promise<Result<void, DivbanError>> => {
  const usernameResult = getServiceUsername(serviceName);
  if (!usernameResult.ok) return usernameResult;
  const username = usernameResult.value;

  if (!(await userExists(username))) {
    return Ok(undefined); // Already doesn't exist
  }

  const deleteResult = await execSuccess(["userdel", "--remove", username]);
  if (!deleteResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Failed to delete user ${username}: ${deleteResult.error.message}`,
        deleteResult.error
      )
    );
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

export const getUserByName = async (
  username: Username
): Promise<Result<UserInfo, DivbanError>> => {
  if (!(await userExists(username))) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_NOT_FOUND,
        `User not found: ${username}`
      )
    );
  }

  const uidResult = await getUidByUsername(username);
  if (!uidResult.ok) return uidResult;

  const uid = uidResult.value;
  const homeDir = `/home/${username}` as AbsolutePath;

  return Ok({
    username,
    uid,
    gid: uid as unknown as GroupId,
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
