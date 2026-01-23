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

import { Effect, pipe } from "effect";
import { DEFAULT_TIMEOUTS } from "../../../config/schema";
import {
  ConfigError,
  ErrorCode,
  type GeneralError,
  ServiceError,
  SystemError,
} from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import { isTransientSystemError, systemRetrySchedule } from "../../../lib/retry";
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

// Uses admin API for zero-downtime reload: existing connections are preserved
// while new config takes effect. Contrast with restart which drops all connections.
export const reloadCaddy = (
  options: ReloadOptions
): Effect.Effect<void, ConfigError | ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { logger, user, uid, containerName = "caddy" } = options;
    const containerCaddyfile = "/etc/caddy/Caddyfile";

    logger.info("Validating Caddyfile...");

    const validateResult = yield* execAsUser(
      user,
      uid,
      ["podman", "exec", containerName, "caddy", "validate", "--config", containerCaddyfile],
      {
        timeout: DEFAULT_TIMEOUTS.validation,
        captureStdout: true,
        captureStderr: true,
      }
    ).pipe(
      Effect.retry({
        schedule: systemRetrySchedule,
        while: (err): boolean => isTransientSystemError(err),
      })
    );

    yield* pipe(
      Effect.succeed(validateResult),
      Effect.filterOrFail(
        (r) => r.exitCode === 0,
        (r) =>
          new ConfigError({
            code: ErrorCode.CONFIG_VALIDATION_ERROR as 12,
            message: `Caddyfile validation failed: ${r.stderr}`,
          })
      )
    );

    logger.info("Caddyfile is valid, reloading...");

    const reloadResult = yield* execAsUser(
      user,
      uid,
      ["podman", "exec", containerName, "caddy", "reload", "--config", containerCaddyfile],
      {
        timeout: DEFAULT_TIMEOUTS.validation,
        captureStdout: true,
        captureStderr: true,
      }
    ).pipe(
      Effect.retry({
        schedule: systemRetrySchedule,
        while: (err): boolean => isTransientSystemError(err),
      })
    );

    yield* pipe(
      Effect.succeed(reloadResult),
      Effect.filterOrFail(
        (r) => r.exitCode === 0,
        (r) =>
          new ServiceError({
            code: ErrorCode.SERVICE_RELOAD_FAILED as 35,
            message: `Caddy reload failed: ${r.stderr}`,
          })
      )
    );

    logger.success("Caddy configuration reloaded successfully");
  });

// Dry-run validation for CI pipelines or pre-reload checks
export const validateCaddyfile = (
  user: Username,
  uid: UserId,
  containerName = "caddy"
): Effect.Effect<void, ConfigError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const containerCaddyfile = "/etc/caddy/Caddyfile";
    const result = yield* execAsUser(
      user,
      uid,
      ["podman", "exec", containerName, "caddy", "validate", "--config", containerCaddyfile],
      {
        timeout: DEFAULT_TIMEOUTS.validation,
        captureStdout: true,
        captureStderr: true,
      }
    ).pipe(
      Effect.retry({
        schedule: systemRetrySchedule,
        while: (err): boolean => isTransientSystemError(err),
      })
    );

    yield* pipe(
      Effect.succeed(result),
      Effect.filterOrFail(
        (r) => r.exitCode === 0,
        (r) =>
          new ConfigError({
            code: ErrorCode.CONFIG_VALIDATION_ERROR as 12,
            message: `Caddyfile validation failed: ${r.stderr}`,
          })
      )
    );
  });

export const formatCaddyfile = (
  content: string,
  user: Username,
  uid: UserId,
  containerName = "caddy"
): Effect.Effect<string, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const result = yield* execAsUser(
      user,
      uid,
      ["podman", "exec", "-i", containerName, "caddy", "fmt", "-"],
      {
        timeout: DEFAULT_TIMEOUTS.validation,
        captureStdout: true,
        captureStderr: true,
        stdin: content,
      }
    ).pipe(
      Effect.retry({
        schedule: systemRetrySchedule,
        while: (err): boolean => isTransientSystemError(err),
      })
    );

    yield* pipe(
      Effect.succeed(result),
      Effect.filterOrFail(
        (r) => r.exitCode === 0,
        (r) =>
          new SystemError({
            code: ErrorCode.EXEC_FAILED as 26,
            message: `Failed to format Caddyfile: ${r.stderr}`,
          })
      )
    );

    return result.stdout;
  });
