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
import type { Username } from "../lib/types";
import { exec, execSuccess } from "./exec";
import { fileExists } from "./fs";

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
export const enableLinger = async (username: Username): Promise<Result<void, DivbanError>> => {
  // Check if already enabled
  if (await isLingerEnabled(username)) {
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
  serviceName: string
): Promise<Result<void, DivbanError>> => {
  const result = await enableLinger(username);

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
