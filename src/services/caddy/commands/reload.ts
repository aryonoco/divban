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

import { DEFAULT_TIMEOUTS } from "../../../config/schema";
import { DivbanError, ErrorCode } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import { Err, Ok, type Result, mapErr } from "../../../lib/result";
import type { UserId, Username } from "../../../lib/types";
import { execAsUser } from "../../../system/exec";

export interface ReloadOptions {
  /** Service user */
  user: Username;
  /** Service user UID */
  uid: UserId;
  /** Logger instance */
  logger: Logger;
  /** Container name (default: caddy) */
  containerName?: string;
}

/**
 * Reload Caddy configuration using the admin API.
 * Uses podman exec to run caddy commands inside the container.
 * This is preferred over systemctl restart as it's graceful.
 */
export const reloadCaddy = async (options: ReloadOptions): Promise<Result<void, DivbanError>> => {
  const { logger, user, uid, containerName = "caddy" } = options;
  // Caddyfile path inside the container
  const containerCaddyfile = "/etc/caddy/Caddyfile";

  logger.info("Validating Caddyfile...");

  // First, validate the Caddyfile using podman exec
  const validateResult = await execAsUser(
    user,
    uid,
    ["podman", "exec", containerName, "caddy", "validate", "--config", containerCaddyfile],
    {
      timeout: DEFAULT_TIMEOUTS.validation,
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

  // Reload via admin API using podman exec
  const reloadResult = await execAsUser(
    user,
    uid,
    ["podman", "exec", containerName, "caddy", "reload", "--config", containerCaddyfile],
    {
      timeout: DEFAULT_TIMEOUTS.validation,
      captureStdout: true,
      captureStderr: true,
    }
  );

  const reloadMapped = mapErr(
    reloadResult,
    (err) =>
      new DivbanError(
        ErrorCode.SERVICE_RELOAD_FAILED,
        `Failed to reload Caddy: ${err.message}`,
        err
      )
  );
  if (!reloadMapped.ok) {
    return reloadMapped;
  }

  if (reloadMapped.value.exitCode !== 0) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_RELOAD_FAILED,
        `Caddy reload failed: ${reloadMapped.value.stderr}`
      )
    );
  }

  logger.success("Caddy configuration reloaded successfully");
  return Ok(undefined);
};

/**
 * Validate a Caddyfile without reloading.
 * Uses podman exec to run caddy validate inside the container.
 */
export const validateCaddyfile = async (
  user: Username,
  uid: UserId,
  containerName = "caddy"
): Promise<Result<void, DivbanError>> => {
  const containerCaddyfile = "/etc/caddy/Caddyfile";
  const result = await execAsUser(
    user,
    uid,
    ["podman", "exec", containerName, "caddy", "validate", "--config", containerCaddyfile],
    {
      timeout: DEFAULT_TIMEOUTS.validation,
      captureStdout: true,
      captureStderr: true,
    }
  );

  const mapped = mapErr(
    result,
    (err) =>
      new DivbanError(
        ErrorCode.CONFIG_VALIDATION_ERROR,
        `Failed to validate Caddyfile: ${err.message}`,
        err
      )
  );
  if (!mapped.ok) {
    return mapped;
  }

  if (mapped.value.exitCode !== 0) {
    return Err(
      new DivbanError(
        ErrorCode.CONFIG_VALIDATION_ERROR,
        `Caddyfile validation failed: ${mapped.value.stderr}`
      )
    );
  }

  return Ok(undefined);
};

/**
 * Format a Caddyfile using caddy fmt.
 * Uses podman exec to run caddy fmt inside the container.
 */
export const formatCaddyfile = async (
  content: string,
  user: Username,
  uid: UserId,
  containerName = "caddy"
): Promise<Result<string, DivbanError>> => {
  const result = await execAsUser(
    user,
    uid,
    ["podman", "exec", "-i", containerName, "caddy", "fmt", "-"],
    {
      timeout: DEFAULT_TIMEOUTS.validation,
      captureStdout: true,
      captureStderr: true,
      stdin: content,
    }
  );

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
