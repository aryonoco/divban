// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based stack orchestration for starting, stopping, and managing multi-container stacks.
 */

import { Effect, Option } from "effect";
import {
  ContainerError,
  ErrorCode,
  GeneralError,
  ServiceError,
  type SystemError,
} from "../lib/errors";
import type { Logger } from "../lib/logger";
import type { UserId, Username } from "../lib/types";
import {
  type SystemctlOptions,
  daemonReload,
  enableService,
  isServiceActive,
  startService,
  stopService,
} from "../system/systemctl";
import { resolveStartOrder, resolveStopOrder } from "./dependencies";
import type { Stack } from "./types";

export interface OrchestratorOptions {
  /** Service user */
  user: Username;
  /** Service user UID */
  uid: UserId;
  /** Logger instance */
  logger: Logger;
  /** Parallel operations (default: true) */
  parallel?: boolean;
}

/**
 * Start all containers in a stack in dependency order.
 */
export const startStack = (
  stack: Stack,
  options: OrchestratorOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { logger, parallel: parallelStart = true } = options;
    const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

    // Resolve start order
    const { levels } = yield* resolveStartOrder(stack.containers);

    // Reload daemon first
    logger.info("Reloading systemd daemon...");
    yield* daemonReload(systemctlOpts);

    // Start containers level by level
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (!level) {
        continue;
      }

      logger.step(i + 1, levels.length, `Starting level ${i + 1}: ${level.join(", ")}`);

      if (parallelStart && level.length > 1) {
        // Start all containers in this level in parallel
        yield* Effect.all(
          level.map((name) =>
            Effect.mapError(
              startService(`${name}.service`, systemctlOpts),
              (e) =>
                new ServiceError({
                  code: ErrorCode.SERVICE_START_FAILED as 31,
                  message: `Failed to start container ${name}: ${e.message}`,
                  service: name,
                  cause: e,
                })
            )
          ),
          { concurrency: "unbounded" }
        );
      } else {
        // Start sequentially
        for (const name of level) {
          yield* Effect.mapError(
            startService(`${name}.service`, systemctlOpts),
            (e) =>
              new ServiceError({
                code: ErrorCode.SERVICE_START_FAILED as 31,
                message: `Failed to start container ${name}: ${e.message}`,
                service: name,
                cause: e,
              })
          );
        }
      }
    }

    logger.success(`Stack '${stack.name}' started successfully`);
  });

/**
 * Stop all containers in a stack in reverse dependency order.
 */
export const stopStack = (
  stack: Stack,
  options: OrchestratorOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { logger, parallel: parallelStop = true } = options;
    const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

    // Resolve stop order (reverse of start)
    const { levels } = yield* resolveStopOrder(stack.containers);

    // Stop containers level by level
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (!level) {
        continue;
      }

      logger.step(i + 1, levels.length, `Stopping level ${i + 1}: ${level.join(", ")}`);

      if (parallelStop && level.length > 1) {
        // Stop all containers in this level in parallel
        yield* Effect.all(
          level.map((name) =>
            Effect.mapError(
              stopService(`${name}.service`, systemctlOpts),
              (e) =>
                new ServiceError({
                  code: ErrorCode.SERVICE_STOP_FAILED as 32,
                  message: `Failed to stop container ${name}: ${e.message}`,
                  service: name,
                  cause: e,
                })
            )
          ),
          { concurrency: "unbounded" }
        );
      } else {
        // Stop sequentially
        for (const name of level) {
          yield* Effect.mapError(
            stopService(`${name}.service`, systemctlOpts),
            (e) =>
              new ServiceError({
                code: ErrorCode.SERVICE_STOP_FAILED as 32,
                message: `Failed to stop container ${name}: ${e.message}`,
                service: name,
                cause: e,
              })
          );
        }
      }
    }

    logger.success(`Stack '${stack.name}' stopped successfully`);
  });

/**
 * Restart all containers in a stack.
 */
export const restartStack = (
  stack: Stack,
  options: OrchestratorOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { logger } = options;

    logger.info(`Restarting stack '${stack.name}'...`);

    // Stop then start (to maintain proper order)
    yield* stopStack(stack, options);
    yield* startStack(stack, options);
  });

/**
 * Enable all containers in a stack to start on boot.
 */
export const enableStack = (
  stack: Stack,
  options: OrchestratorOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { logger } = options;
    const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

    logger.info(`Enabling stack '${stack.name}'...`);

    for (const container of stack.containers) {
      yield* Effect.mapError(
        enableService(`${container.name}.service`, systemctlOpts),
        (e) =>
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `Failed to enable container ${container.name}: ${e.message}`,
            cause: e,
          })
      );
    }

    logger.success(`Stack '${stack.name}' enabled successfully`);
  });

/**
 * Get status of all containers in a stack.
 */
export const getStackStatus = (
  stack: Stack,
  options: OrchestratorOptions
): Effect.Effect<
  Array<{ name: string; running: boolean; description?: string }>,
  ServiceError | SystemError
> =>
  Effect.gen(function* () {
    const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };
    const statuses: Array<{ name: string; running: boolean; description?: string }> = [];

    for (const container of stack.containers) {
      const running = yield* isServiceActive(`${container.name}.service`, systemctlOpts);
      const status: { name: string; running: boolean; description?: string } = {
        name: container.name,
        running,
      };
      const descOpt = Option.fromNullable(container.description);
      if (Option.isSome(descOpt)) {
        status.description = descOpt.value;
      }
      statuses.push(status);
    }

    return statuses;
  });

/**
 * Check if all containers in a stack are running.
 */
export const isStackRunning = (
  stack: Stack,
  options: OrchestratorOptions
): Effect.Effect<boolean, ServiceError | SystemError> =>
  Effect.gen(function* () {
    const statuses = yield* getStackStatus(stack, options);
    return statuses.every((s) => s.running);
  });

/**
 * Start a single container in a stack (with its dependencies).
 */
export const startContainer = (
  stack: Stack,
  containerName: string,
  options: OrchestratorOptions
): Effect.Effect<void, ServiceError | SystemError | ContainerError | GeneralError> =>
  Effect.gen(function* () {
    const { logger } = options;
    const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

    const containerOpt = Option.fromNullable(
      stack.containers.find((c) => c.name === containerName)
    );
    if (Option.isNone(containerOpt)) {
      return yield* Effect.fail(
        new ContainerError({
          code: ErrorCode.CONTAINER_NOT_FOUND as 44,
          message: `Container '${containerName}' not found in stack`,
          container: containerName,
        })
      );
    }

    // Reload daemon first
    yield* daemonReload(systemctlOpts);

    // Start the container (systemd will handle dependencies)
    logger.info(`Starting container '${containerName}'...`);
    yield* Effect.mapError(
      startService(`${containerName}.service`, systemctlOpts),
      (e) =>
        new ServiceError({
          code: ErrorCode.SERVICE_START_FAILED as 31,
          message: `Failed to start container ${containerName}: ${e.message}`,
          service: containerName,
          cause: e,
        })
    );

    logger.success(`Container '${containerName}' started successfully`);
  });

/**
 * Stop a single container in a stack.
 */
export const stopContainer = (
  _stack: Stack,
  containerName: string,
  options: OrchestratorOptions
): Effect.Effect<void, ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { logger } = options;
    const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

    logger.info(`Stopping container '${containerName}'...`);
    yield* Effect.mapError(
      stopService(`${containerName}.service`, systemctlOpts),
      (e) =>
        new ServiceError({
          code: ErrorCode.SERVICE_STOP_FAILED as 32,
          message: `Failed to stop container ${containerName}: ${e.message}`,
          service: containerName,
          cause: e,
        })
    );

    logger.success(`Container '${containerName}' stopped successfully`);
  });
