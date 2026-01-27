// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Stack lifecycle orchestration via systemd. Start/stop operations
 * respect dependency order from topological sort. Parallel mode runs
 * containers within the same dependency level concurrently - safe
 * because they have no interdependencies. Daemon reload ensures
 * systemd sees updated quadlet files before starting services.
 */

import { Effect, Option, pipe } from "effect";
import {
  ContainerError,
  ErrorCode,
  type GeneralError,
  type ServiceError,
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
  user: Username;
  uid: UserId;
  logger: Logger;
  parallel?: boolean;
}

const toServiceUnit = (name: string): string => `${name}.service`;

/** Levels run sequentially; within a level, containers may run concurrently (no interdependencies). */
const processLevels = <E>(
  levels: readonly (readonly string[])[],
  operation: (name: string) => Effect.Effect<void, E>,
  logger: Logger,
  actionVerb: string,
  parallel: boolean
): Effect.Effect<void, E> =>
  Effect.forEach(
    levels,
    (level, i) =>
      pipe(
        Effect.sync(() =>
          logger.step(i + 1, levels.length, `${actionVerb} level ${i + 1}: ${level.join(", ")}`)
        ),
        Effect.andThen(
          Effect.forEach(
            level,
            operation,
            parallel && level.length > 1 ? { concurrency: "unbounded" } : undefined
          )
        )
      ),
    { discard: true }
  );

/**
 * Start all containers in a stack in dependency order.
 */
export const startStack = (
  stack: Stack,
  options: OrchestratorOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { logger, parallel = true } = options;
    const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

    const { levels } = yield* resolveStartOrder(stack.containers);

    logger.info("Reloading systemd daemon...");
    yield* daemonReload(systemctlOpts);

    yield* processLevels(
      levels,
      (name) => startService(toServiceUnit(name), systemctlOpts),
      logger,
      "Starting",
      parallel
    );

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
    const { logger, parallel = true } = options;
    const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

    const { levels } = yield* resolveStopOrder(stack.containers);

    yield* processLevels(
      levels,
      (name) => stopService(toServiceUnit(name), systemctlOpts),
      logger,
      "Stopping",
      parallel
    );

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

    yield* Effect.forEach(
      stack.containers,
      (container) => enableService(toServiceUnit(container.name), systemctlOpts),
      { discard: true }
    );

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
  pipe(
    Effect.forEach(stack.containers, (container) =>
      pipe(
        isServiceActive(toServiceUnit(container.name), { user: options.user, uid: options.uid }),
        Effect.map((running) => ({
          name: container.name,
          running,
          ...(container.description !== undefined ? { description: container.description } : {}),
        }))
      )
    )
  );

export const isStackRunning = (
  stack: Stack,
  options: OrchestratorOptions
): Effect.Effect<boolean, ServiceError | SystemError> =>
  pipe(
    getStackStatus(stack, options),
    Effect.map((statuses) => statuses.every((s) => s.running))
  );

/**
 * Start a single container in a stack.
 */
export const startContainer = (
  stack: Stack,
  containerName: string,
  options: OrchestratorOptions
): Effect.Effect<void, ServiceError | SystemError | ContainerError | GeneralError> =>
  Effect.gen(function* () {
    const { logger } = options;
    const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

    yield* pipe(
      Option.fromNullable(stack.containers.find((c) => c.name === containerName)),
      Option.match({
        onNone: (): Effect.Effect<void, ContainerError> =>
          Effect.fail(
            new ContainerError({
              code: ErrorCode.CONTAINER_NOT_FOUND,
              message: `Container '${containerName}' not found in stack`,
              container: containerName,
            })
          ),
        onSome: (): Effect.Effect<void, never> => Effect.void,
      })
    );

    yield* daemonReload(systemctlOpts);

    logger.info(`Starting container '${containerName}'...`);
    yield* startService(toServiceUnit(containerName), systemctlOpts);

    logger.success(`Container '${containerName}' started successfully`);
  });

/**
 * Stop a single container in a stack.
 */
export const stopContainer = (
  _stack: Stack,
  containerName: string,
  options: OrchestratorOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { logger } = options;
    const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

    logger.info(`Stopping container '${containerName}'...`);
    yield* stopService(toServiceUnit(containerName), systemctlOpts);

    logger.success(`Container '${containerName}' stopped successfully`);
  });
