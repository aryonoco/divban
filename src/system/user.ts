// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * User management
 * Creates isolated users with proper subuid/subgid configuration.
 */

import { Array as Arr, Effect, Exit, Option, Schedule, pipe } from "effect";
import { getServiceUsername } from "../config/schema";
import { ErrorCode, GeneralError, ServiceError, SystemError } from "../lib/errors";
import { SYSTEM_PATHS, userHomeDir } from "../lib/paths";
import { systemRetrySchedule } from "../lib/retry";
import type { AbsolutePath, GroupId, SubordinateId, UserId, Username } from "../lib/types";
import { userIdToGroupId } from "../lib/types";
import type { Acquired } from "../services/helpers";
import { exec, execSuccess } from "./exec";
import { atomicWrite, readFileOrEmpty } from "./fs";
import { withLock } from "./lock";
import {
  SUBUID_RANGE,
  type UidAllocationSettings,
  allocateSubuidRange,
  allocateUidInternal,
  getExistingSubuidStart,
  getNologinShell,
  getUidByUsername,
  userExists,
} from "./uid-allocator";

/**
 * Verify existing user has correct configuration.
 * Checks UID, home directory, and shell match expectations.
 */
const verifyUserConfig = (
  username: Username,
  expectedHome: AbsolutePath,
  expectedUid: UserId
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const result = yield* exec(["getent", "passwd", username], {
      captureStdout: true,
    });

    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.USER_CREATE_FAILED as 20,
          message: `Failed to verify user ${username}`,
        })
      );
    }

    const parts = result.stdout.trim().split(":");
    if (parts.length < 7) {
      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.USER_CREATE_FAILED as 20,
          message: `Invalid passwd entry for ${username}`,
        })
      );
    }

    const passwdUid = parts[2];
    const homeDir = parts[5];
    const shell = parts[6];

    // Verify UID matches
    if (Number(passwdUid) !== expectedUid) {
      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.USER_CREATE_FAILED as 20,
          message: `User ${username} exists with UID ${passwdUid}, expected ${expectedUid}`,
        })
      );
    }

    // Verify home directory matches
    if (homeDir !== expectedHome) {
      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.USER_CREATE_FAILED as 20,
          message: `User ${username} has home ${homeDir}, expected ${expectedHome}`,
        })
      );
    }

    // Verify shell is nologin (security requirement)
    if (!(shell?.endsWith("/nologin") || shell?.endsWith("/false"))) {
      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.USER_CREATE_FAILED as 20,
          message: `User ${username} has interactive shell ${shell}, expected nologin`,
        })
      );
    }
  });

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
const isUidConflictError = (error: SystemError | GeneralError): boolean =>
  error.message.toLowerCase().includes("uid") &&
  (error.message.toLowerCase().includes("exists") ||
    error.message.toLowerCase().includes("already in use"));

/**
 * Attempt cleanup, logging failures but not propagating errors.
 * Used for secondary cleanup that shouldn't fail the main operation.
 */
const cleanupWithWarning = (
  cleanup: Effect.Effect<void, SystemError | GeneralError>,
  context: string
): Effect.Effect<void, never> =>
  cleanup.pipe(
    Effect.tapError((err) =>
      Effect.sync(() => console.warn(`Warning: ${context}: ${err.message}`))
    ),
    Effect.ignore
  );

/**
 * Atomically append entry to subuid/subgid file if not already present.
 */
const appendSubidEntry = (
  file: AbsolutePath,
  username: Username,
  entry: string
): Effect.Effect<void, SystemError> =>
  Effect.gen(function* () {
    const content = yield* readFileOrEmpty(file);

    // Already configured - return success (idempotent)
    if (content.includes(`${username}:`)) {
      return;
    }

    // Atomic write entire file with appended entry
    yield* atomicWrite(file, content + entry).pipe(
      Effect.mapError(
        (e) =>
          new SystemError({
            code: ErrorCode.SUBUID_CONFIG_FAILED as 21,
            message: `Failed to configure ${file}`,
            ...(e instanceof Error ? { cause: e } : {}),
          })
      )
    );
  });

/**
 * Configure subordinate UIDs and GIDs for a user.
 * Uses atomic writes and locking to prevent race conditions.
 */
export const configureSubordinateIds = (
  username: Username,
  start: SubordinateId,
  range: number
): Effect.Effect<void, SystemError | GeneralError> =>
  withLock(
    "subid-config",
    Effect.gen(function* () {
      const entry = `${username}:${start}:${range}\n`;

      // Re-read files after acquiring lock to ensure consistency
      yield* appendSubidEntry(SYSTEM_PATHS.subuid as AbsolutePath, username, entry);
      yield* appendSubidEntry(SYSTEM_PATHS.subgid as AbsolutePath, username, entry);
    })
  );

/**
 * Remove a single user entry from a subid file.
 * Idempotent - returns Ok if entry doesn't exist.
 */
const removeSubidEntry = (
  file: AbsolutePath,
  username: Username
): Effect.Effect<void, SystemError> =>
  Effect.gen(function* () {
    const content = yield* readFileOrEmpty(file);

    // If no entry exists, success (idempotent)
    if (!content.includes(`${username}:`)) {
      return;
    }

    // Filter out the user's line(s)
    const filtered = pipe(
      content.split("\n"),
      Arr.filter((line) => !line.startsWith(`${username}:`))
    ).join("\n");

    // Preserve trailing newline if content remains
    const newContent = filtered.trim() ? `${filtered.trimEnd()}\n` : "";

    yield* atomicWrite(file, newContent).pipe(
      Effect.mapError(
        (e) =>
          new SystemError({
            code: ErrorCode.SUBUID_CONFIG_FAILED as 21,
            message: `Failed to remove ${username} from ${file}`,
            ...(e instanceof Error ? { cause: e } : {}),
          })
      )
    );
  });

/**
 * Remove a user's entries from /etc/subuid and /etc/subgid.
 * Used for rollback on partial failure and user deletion cleanup.
 * Idempotent - returns Ok if entries don't exist.
 */
const removeSubordinateIds = (
  username: Username
): Effect.Effect<void, SystemError | GeneralError> =>
  withLock(
    "subid-config",
    Effect.gen(function* () {
      yield* removeSubidEntry(SYSTEM_PATHS.subuid as AbsolutePath, username);
      yield* removeSubidEntry(SYSTEM_PATHS.subgid as AbsolutePath, username);
    })
  );

/**
 * Delete a service user and their home directory.
 * Also cleans up /etc/subuid and /etc/subgid entries.
 * Idempotent - returns Ok if user doesn't exist.
 */
export const deleteServiceUser = (
  serviceName: string
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const username = yield* getServiceUsername(serviceName);

    const exists = yield* userExists(username);
    if (!exists) {
      // User doesn't exist, but still clean up any orphaned subuid/subgid entries
      yield* cleanupWithWarning(
        removeSubordinateIds(username),
        `Failed to clean orphaned subuid/subgid for ${username}`
      );
      return;
    }

    // Delete the user account and home directory
    yield* execSuccess(["userdel", "--remove", username]).pipe(
      Effect.mapError(
        (err) =>
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `Failed to delete user ${username}: ${err.message}`,
            ...(err instanceof Error ? { cause: err } : {}),
          })
      )
    );

    // Remove from subuid/subgid (userdel does NOT do this on all distros)
    yield* cleanupWithWarning(
      removeSubordinateIds(username),
      `User ${username} deleted, but failed to clean subuid/subgid`
    );
  });

/**
 * Create a system user with the given UID.
 * Returns the UID on success.
 */
const createUserWithUid = (
  username: Username,
  homeDir: AbsolutePath,
  shell: string,
  serviceName: string,
  allocatedUid: UserId
): Effect.Effect<UserId, SystemError> =>
  execSuccess([
    "useradd",
    "--uid",
    String(allocatedUid),
    "--home-dir",
    homeDir,
    "--create-home",
    "--shell",
    shell,
    "--comment",
    `divban service - ${serviceName}`,
    username,
  ]).pipe(
    Effect.map(() => allocatedUid),
    Effect.mapError(
      (err) =>
        new SystemError({
          code: ErrorCode.USER_CREATE_FAILED as 20,
          message: `Failed to create user ${username}: ${err.message}`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

/**
 * Create a service user with dynamically allocated UID.
 * Username is derived from service name: divban-<service>
 * UID is allocated from range 10000-59999
 * Subuid range is allocated to avoid conflicts
 */
export const createServiceUser = (
  serviceName: string,
  settings?: UidAllocationSettings
): Effect.Effect<ServiceUser, SystemError | GeneralError> =>
  Effect.gen(function* () {
    // Derive username from service name
    const username = yield* getServiceUsername(serviceName);
    const homeDir = userHomeDir(username);

    // 1. Check if user already exists (idempotent with verification)
    const exists = yield* userExists(username);
    if (exists) {
      const uid = yield* getUidByUsername(username);

      // Verify existing user configuration is correct
      yield* verifyUserConfig(username, homeDir, uid);

      const subuidStart = yield* getExistingSubuidStart(username);

      return {
        username,
        uid,
        gid: userIdToGroupId(uid),
        subuidStart,
        subuidSize: SUBUID_RANGE.size,
        homeDir,
      };
    }

    // 2. Get nologin shell (auto-detected per distro)
    const shell = yield* getNologinShell();

    // 3. Allocate UID and create user atomically with retry on conflict
    const retrySchedule = pipe(
      systemRetrySchedule,
      Schedule.whileInput((err: SystemError | GeneralError) => isUidConflictError(err))
    );

    // 4. Create user with scoped rollback - if any subsequent operation fails,
    //    the user is automatically deleted
    return yield* Effect.scoped(
      Effect.gen(function* () {
        // Acquire: allocate UID and create user
        // Release: delete user on failure
        const uid = yield* Effect.acquireRelease(
          withLock(
            "uid-allocation",
            Effect.gen(function* () {
              const allocatedUid = yield* allocateUidInternal(settings);
              yield* createUserWithUid(username, homeDir, shell, serviceName, allocatedUid);
              return allocatedUid;
            })
          ).pipe(Effect.retry(retrySchedule)),
          (_, exit) =>
            Exit.isFailure(exit) ? deleteServiceUser(serviceName).pipe(Effect.ignore) : Effect.void
        );

        // === POINT OF NO RETURN: User created, rollback on subsequent failure ===

        // 5. Dynamically allocate next available subuid range
        const subuidAlloc = yield* allocateSubuidRange(
          settings?.subuidRangeSize ?? SUBUID_RANGE.size,
          settings
        );

        // 6. Configure subuid/subgid
        yield* configureSubordinateIds(username, subuidAlloc.start, subuidAlloc.size);

        return {
          username,
          uid,
          gid: userIdToGroupId(uid),
          subuidStart: subuidAlloc.start,
          subuidSize: subuidAlloc.size,
          homeDir,
        };
      })
    );
  });

/**
 * Get user information if they exist.
 */
export const getServiceUser = (
  serviceName: string
): Effect.Effect<Option.Option<ServiceUser>, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const username = yield* getServiceUsername(serviceName);

    const exists = yield* userExists(username);
    if (!exists) {
      return Option.none();
    }

    const uid = yield* getUidByUsername(username);
    const subuidStart = yield* getExistingSubuidStart(username);

    return Option.some({
      username,
      uid,
      gid: userIdToGroupId(uid),
      subuidStart,
      subuidSize: SUBUID_RANGE.size,
      homeDir: userHomeDir(username),
    });
  });

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

export const getUserByName = (
  username: Username
): Effect.Effect<UserInfo, SystemError | GeneralError | ServiceError> =>
  Effect.gen(function* () {
    const exists = yield* userExists(username);
    if (!exists) {
      return yield* Effect.fail(
        new ServiceError({
          code: ErrorCode.SERVICE_NOT_FOUND as 30,
          message: `User not found: ${username}`,
        })
      );
    }

    const uid = yield* getUidByUsername(username);
    const homeDir = userHomeDir(username);

    return {
      username,
      uid,
      gid: userIdToGroupId(uid),
      homeDir,
    };
  });

/**
 * Check if current process is running as root.
 */
export const isRoot = (): boolean => {
  return process.getuid?.() === 0;
};

/**
 * Require root privileges, returning an error if not root.
 */
export const requireRoot = (): Effect.Effect<void, GeneralError> => {
  if (!isRoot()) {
    return Effect.fail(
      new GeneralError({
        code: ErrorCode.ROOT_REQUIRED as 3,
        message: "This operation requires root privileges. Please run with sudo.",
      })
    );
  }
  return Effect.void;
};

// ============================================================================
// Tracked User Operations
// ============================================================================

/**
 * Acquire service user with creation tracking.
 * Returns Acquired<ServiceUser> for idempotent rollback support.
 */
export const acquireServiceUser = (
  serviceName: string,
  settings?: UidAllocationSettings
): Effect.Effect<Acquired<ServiceUser>, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const username = yield* getServiceUsername(serviceName);
    const homeDir = userHomeDir(username);

    const exists = yield* userExists(username);

    if (exists) {
      // User exists - verify and return with wasCreated: false
      const uid = yield* getUidByUsername(username);
      yield* verifyUserConfig(username, homeDir, uid);
      const subuidStart = yield* getExistingSubuidStart(username);

      return {
        value: {
          username,
          uid,
          gid: userIdToGroupId(uid),
          subuidStart,
          subuidSize: SUBUID_RANGE.size,
          homeDir,
        },
        wasCreated: false,
      };
    }

    // Create new user
    const user = yield* createServiceUser(serviceName, settings);
    return { value: user, wasCreated: true };
  });

/**
 * Release function - conditional cleanup based on wasCreated.
 */
export const releaseServiceUser = (
  serviceName: string,
  wasCreated: boolean
): Effect.Effect<void, never> =>
  wasCreated ? deleteServiceUser(serviceName).pipe(Effect.ignore) : Effect.void;
