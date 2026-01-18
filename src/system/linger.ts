// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * User linger management for persistent systemd user services.
 * Enables services to run without an active login session.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { SYSTEM_PATHS, lingerFile } from "../lib/paths";
import { Err, Ok, type Result } from "../lib/result";
import type { UserId, Username } from "../lib/types";
import { exec, execSuccess } from "./exec";
import { fileExists } from "./fs";

/**
 * Start the systemd user service for a user.
 * On some systems (like WSL), enabling linger doesn't automatically start the user session.
 * This is idempotent - if the service is already running, it's a no-op.
 */
const startUserService = async (uid: UserId): Promise<Result<void, DivbanError>> => {
  const result = await execSuccess(["systemctl", "start", `user@${uid}.service`]);
  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.LINGER_ENABLE_FAILED,
        `Failed to start user service for uid ${uid}: ${result.error.message}`,
        result.error
      )
    );
  }
  return Ok(undefined);
};

/**
 * Wait for the systemd user session to be ready.
 * Polls for the D-Bus socket at /run/user/{uid}/bus.
 * Uses node:fs instead of Bun.file() because Bun.file().exists() returns false for Unix sockets.
 */
const waitForUserSession = async (
  uid: UserId,
  maxWaitMs = 30000,
  intervalMs = 100
): Promise<boolean> => {
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
};

/**
 * Check if linger is enabled for a user.
 */
export const isLingerEnabled = (username: Username): Promise<boolean> => {
  // Check the linger file directly (more reliable than loginctl)
  return fileExists(lingerFile(username));
};

/**
 * Enable linger for a user.
 * This allows their systemd user services to run without an active login session.
 */
export const enableLinger = async (
  username: Username,
  uid: UserId
): Promise<Result<void, DivbanError>> => {
  // Check if already enabled
  if (await isLingerEnabled(username)) {
    // Still need to ensure user service is running and session is ready
    const startResult = await startUserService(uid);
    if (!startResult.ok) {
      return startResult;
    }
    const sessionReady = await waitForUserSession(uid);
    if (!sessionReady) {
      return Err(
        new DivbanError(
          ErrorCode.LINGER_ENABLE_FAILED,
          `User session not ready for ${username} after enabling linger`
        )
      );
    }
    return Ok(undefined);
  }

  const result = await execSuccess(["loginctl", "enable-linger", username]);

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.LINGER_ENABLE_FAILED,
        `Failed to enable linger for ${username}: ${result.error.message}`,
        result.error
      )
    );
  }

  // Verify it was enabled
  if (!(await isLingerEnabled(username))) {
    return Err(
      new DivbanError(
        ErrorCode.LINGER_ENABLE_FAILED,
        `Linger was not enabled for ${username} despite successful command`
      )
    );
  }

  // Explicitly start the user service (idempotent, needed on some systems like WSL)
  const startResult = await startUserService(uid);
  if (!startResult.ok) {
    return startResult;
  }

  // Wait for user session to be ready
  const sessionReady = await waitForUserSession(uid);
  if (!sessionReady) {
    return Err(
      new DivbanError(
        ErrorCode.LINGER_ENABLE_FAILED,
        `User session not ready for ${username} after enabling linger`
      )
    );
  }

  return Ok(undefined);
};

/**
 * Disable linger for a user.
 */
export const disableLinger = async (username: Username): Promise<Result<void, DivbanError>> => {
  // Check if already disabled
  if (!(await isLingerEnabled(username))) {
    return Ok(undefined);
  }

  const result = await execSuccess(["loginctl", "disable-linger", username]);

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Failed to disable linger for ${username}: ${result.error.message}`,
        result.error
      )
    );
  }

  return Ok(undefined);
};

/**
 * Get list of users with linger enabled.
 */
export const getLingeringUsers = async (): Promise<Result<string[], DivbanError>> => {
  const result = await exec(["ls", SYSTEM_PATHS.lingerDir], { captureStdout: true });

  if (!result.ok) {
    // Directory might not exist if no users have linger enabled
    return Ok([]);
  }

  if (result.value.exitCode !== 0) {
    return Ok([]);
  }

  const users = result.value.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return Ok(users);
};

/**
 * Ensure linger is enabled for a service user, with proper error context.
 */
export const ensureLinger = async (
  username: Username,
  uid: UserId,
  serviceName: string
): Promise<Result<void, DivbanError>> => {
  const result = await enableLinger(username, uid);

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.LINGER_ENABLE_FAILED,
        `Failed to enable linger for service ${serviceName} (user: ${username})`,
        result.error
      )
    );
  }

  return Ok(undefined);
};
