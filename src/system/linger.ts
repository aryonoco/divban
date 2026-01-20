// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * User linger management using Effect for error handling.
 * Enables services to run without an active login session.
 */

import { Effect } from "effect";
import { ErrorCode, GeneralError, SystemError } from "../lib/errors";
import { SYSTEM_PATHS, lingerFile } from "../lib/paths";
import type { UserId, Username } from "../lib/types";
import { exec, execSuccess } from "./exec";
import { fileExists } from "./fs";

/**
 * Start the systemd user service for a user.
 * On some systems (like WSL), enabling linger doesn't automatically start the user session.
 * This is idempotent - if the service is already running, it's a no-op.
 */
const startUserService = (uid: UserId): Effect.Effect<void, SystemError | GeneralError> =>
  execSuccess(["systemctl", "start", `user@${uid}.service`]).pipe(
    Effect.map(() => undefined),
    Effect.mapError(
      (err) =>
        new SystemError({
          code: ErrorCode.LINGER_ENABLE_FAILED as 23,
          message: `Failed to start user service for uid ${uid}: ${err.message}`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

/**
 * Wait for the systemd user session to be ready.
 * Polls for the D-Bus socket at /run/user/{uid}/bus.
 * Uses node:fs instead of Bun.file() because Bun.file().exists() returns false for Unix sockets.
 */
const waitForUserSession = (
  uid: UserId,
  maxWaitMs = 30000,
  intervalMs = 100
): Effect.Effect<boolean, never> =>
  Effect.promise(async () => {
    const { existsSync } = await import("node:fs");
    const socketPath = `/run/user/${uid}/bus`;
    const maxAttempts = Math.ceil(maxWaitMs / intervalMs);

    for (let i = 0; i < maxAttempts; i++) {
      if (existsSync(socketPath)) {
        return true;
      }
      await Bun.sleep(intervalMs);
    }
    return false;
  });

/**
 * Check if linger is enabled for a user.
 */
export const isLingerEnabled = (username: Username): Effect.Effect<boolean, never> =>
  fileExists(lingerFile(username));

/**
 * Enable linger for a user.
 * This allows their systemd user services to run without an active login session.
 */
export const enableLinger = (
  username: Username,
  uid: UserId
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    // Check if already enabled
    const alreadyEnabled = yield* isLingerEnabled(username);

    if (alreadyEnabled) {
      // Still need to ensure user service is running and session is ready
      yield* startUserService(uid);
      const sessionReady = yield* waitForUserSession(uid);
      if (!sessionReady) {
        return yield* Effect.fail(
          new SystemError({
            code: ErrorCode.LINGER_ENABLE_FAILED as 23,
            message: `User session not ready for ${username} after enabling linger`,
          })
        );
      }
      return;
    }

    yield* execSuccess(["loginctl", "enable-linger", username]).pipe(
      Effect.mapError(
        (err) =>
          new SystemError({
            code: ErrorCode.LINGER_ENABLE_FAILED as 23,
            message: `Failed to enable linger for ${username}: ${err.message}`,
            ...(err instanceof Error ? { cause: err } : {}),
          })
      )
    );

    // Verify it was enabled
    const enabled = yield* isLingerEnabled(username);
    if (!enabled) {
      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.LINGER_ENABLE_FAILED as 23,
          message: `Linger was not enabled for ${username} despite successful command`,
        })
      );
    }

    // Explicitly start the user service (idempotent, needed on some systems like WSL)
    yield* startUserService(uid);

    // Wait for user session to be ready
    const sessionReady = yield* waitForUserSession(uid);
    if (!sessionReady) {
      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.LINGER_ENABLE_FAILED as 23,
          message: `User session not ready for ${username} after enabling linger`,
        })
      );
    }
  });

/**
 * Disable linger for a user.
 */
export const disableLinger = (
  username: Username
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    // Check if already disabled
    const enabled = yield* isLingerEnabled(username);
    if (!enabled) {
      return;
    }

    yield* execSuccess(["loginctl", "disable-linger", username]).pipe(
      Effect.mapError(
        (err) =>
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `Failed to disable linger for ${username}: ${err.message}`,
            ...(err instanceof Error ? { cause: err } : {}),
          })
      )
    );
  });

/**
 * Get list of users with linger enabled.
 */
export const getLingeringUsers = (): Effect.Effect<string[], never> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(
      exec(["ls", SYSTEM_PATHS.lingerDir], { captureStdout: true })
    );

    if (result._tag === "Left") {
      // Directory might not exist if no users have linger enabled
      return [];
    }

    if (result.right.exitCode !== 0) {
      return [];
    }

    return result.right.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  });

/**
 * Ensure linger is enabled for a service user, with proper error context.
 */
export const ensureLinger = (
  username: Username,
  uid: UserId,
  serviceName: string
): Effect.Effect<void, SystemError | GeneralError> =>
  enableLinger(username, uid).pipe(
    Effect.mapError(
      (err) =>
        new SystemError({
          code: ErrorCode.LINGER_ENABLE_FAILED as 23,
          message: `Failed to enable linger for service ${serviceName} (user: ${username})`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );
