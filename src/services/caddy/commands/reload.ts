// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddy-specific reload command.
 * Uses the Caddy admin API for graceful configuration reload.
 */

import { DivbanError, ErrorCode } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import { Err, Ok, type Result } from "../../../lib/result";
import type { AbsolutePath, UserId, Username } from "../../../lib/types";
import { execAsUser } from "../../../system/exec";

export interface ReloadOptions {
  /** Path to Caddyfile */
  caddyfilePath: AbsolutePath;
  /** Service user */
  user: Username;
  /** Service user UID */
  uid: UserId;
  /** Logger instance */
  logger: Logger;
  /** Admin API endpoint (default: localhost:2019) */
  adminEndpoint?: string;
}

/**
 * Reload Caddy configuration using the admin API.
 * This is preferred over systemctl restart as it's graceful.
 */
export const reloadCaddy = async (options: ReloadOptions): Promise<Result<void, DivbanError>> => {
  const { logger, caddyfilePath, user, uid, adminEndpoint = "localhost:2019" } = options;

  logger.info("Validating Caddyfile...");

  // First, validate the Caddyfile
  const validateResult = await execAsUser(
    user,
    uid,
    ["caddy", "validate", "--config", caddyfilePath],
    {
      captureStdout: true,
      captureStderr: true,
    }
  );

  if (!validateResult.ok || validateResult.value.exitCode !== 0) {
    const stderr = validateResult.ok ? validateResult.value.stderr : "";
    return Err(
      new DivbanError(ErrorCode.CONFIG_VALIDATION_ERROR, `Caddyfile validation failed: ${stderr}`)
    );
  }

  logger.info("Caddyfile is valid, reloading...");

  // Reload via admin API
  // caddy reload --config <path> --address <admin>
  const reloadResult = await execAsUser(
    user,
    uid,
    ["caddy", "reload", "--config", caddyfilePath, "--address", adminEndpoint],
    {
      captureStdout: true,
      captureStderr: true,
    }
  );

  if (!reloadResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_RELOAD_FAILED,
        `Failed to reload Caddy: ${reloadResult.error.message}`,
        reloadResult.error
      )
    );
  }

  if (reloadResult.value.exitCode !== 0) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_RELOAD_FAILED,
        `Caddy reload failed: ${reloadResult.value.stderr}`
      )
    );
  }

  logger.success("Caddy configuration reloaded successfully");
  return Ok(undefined);
};

/**
 * Validate a Caddyfile without reloading.
 */
export const validateCaddyfile = async (
  caddyfilePath: AbsolutePath,
  user: Username,
  uid: UserId
): Promise<Result<void, DivbanError>> => {
  const result = await execAsUser(user, uid, ["caddy", "validate", "--config", caddyfilePath], {
    captureStdout: true,
    captureStderr: true,
  });

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.CONFIG_VALIDATION_ERROR,
        `Failed to validate Caddyfile: ${result.error.message}`,
        result.error
      )
    );
  }

  if (result.value.exitCode !== 0) {
    return Err(
      new DivbanError(
        ErrorCode.CONFIG_VALIDATION_ERROR,
        `Caddyfile validation failed: ${result.value.stderr}`
      )
    );
  }

  return Ok(undefined);
};

/**
 * Format a Caddyfile using caddy fmt.
 */
export const formatCaddyfile = async (
  content: string,
  user: Username,
  uid: UserId
): Promise<Result<string, DivbanError>> => {
  const result = await execAsUser(user, uid, ["caddy", "fmt", "-"], {
    captureStdout: true,
    captureStderr: true,
    stdin: content,
  });

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Failed to format Caddyfile: ${result.error.message}`,
        result.error
      )
    );
  }

  return Ok(result.value.stdout);
};
