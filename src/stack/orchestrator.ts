// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Stack orchestration for starting, stopping, and managing multi-container stacks.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import type { Logger } from "../lib/logger";
import {
  Err,
  Ok,
  type Result,
  asyncFlatMapResult,
  mapErr,
  parallel,
  sequence,
} from "../lib/result";
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
export const startStack = async (
  stack: Stack,
  options: OrchestratorOptions
): Promise<Result<void, DivbanError>> => {
  const { logger, parallel: parallelStart = true } = options;
  const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

  // Resolve start order
  const orderResult = resolveStartOrder(stack.containers);
  if (!orderResult.ok) {
    return orderResult;
  }

  const { levels } = orderResult.value;

  // Reload daemon first
  logger.info("Reloading systemd daemon...");
  const reloadResult = await daemonReload(systemctlOpts);
  if (!reloadResult.ok) {
    return reloadResult;
  }

  // Start containers level by level
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    if (!level) {
      continue;
    }

    logger.step(i + 1, levels.length, `Starting level ${i + 1}: ${level.join(", ")}`);

    if (parallelStart && level.length > 1) {
      // Start all containers in this level in parallel
      const result = await parallel(
        level.map((name) => startService(`${name}.service`, systemctlOpts))
      );
      if (!result.ok) {
        return result;
      }
    } else {
      // Start sequentially
      for (const name of level) {
        const result = await startService(`${name}.service`, systemctlOpts);
        if (!result.ok) {
          return Err(
            new DivbanError(
              ErrorCode.SERVICE_START_FAILED,
              `Failed to start container ${name}`,
              result.error
            )
          );
        }
      }
    }
  }

  logger.success(`Stack '${stack.name}' started successfully`);
  return Ok(undefined);
};

/**
 * Stop all containers in a stack in reverse dependency order.
 */
export const stopStack = async (
  stack: Stack,
  options: OrchestratorOptions
): Promise<Result<void, DivbanError>> => {
  const { logger, parallel: parallelStop = true } = options;
  const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

  // Resolve stop order (reverse of start)
  const orderResult = resolveStopOrder(stack.containers);
  if (!orderResult.ok) {
    return orderResult;
  }

  const { levels } = orderResult.value;

  // Stop containers level by level
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    if (!level) {
      continue;
    }

    logger.step(i + 1, levels.length, `Stopping level ${i + 1}: ${level.join(", ")}`);

    if (parallelStop && level.length > 1) {
      // Stop all containers in this level in parallel
      const result = await parallel(
        level.map((name) => stopService(`${name}.service`, systemctlOpts))
      );
      if (!result.ok) {
        return result;
      }
    } else {
      // Stop sequentially
      for (const name of level) {
        const result = await stopService(`${name}.service`, systemctlOpts);
        if (!result.ok) {
          // Log warning but continue stopping other containers
          logger.warn(`Failed to stop container ${name}: ${result.error.message}`);
        }
      }
    }
  }

  logger.success(`Stack '${stack.name}' stopped successfully`);
  return Ok(undefined);
};

/**
 * Restart all containers in a stack.
 */
export const restartStack = async (
  stack: Stack,
  options: OrchestratorOptions
): Promise<Result<void, DivbanError>> => {
  const { logger } = options;

  logger.info(`Restarting stack '${stack.name}'...`);

  // Stop then start (to maintain proper order)
  return asyncFlatMapResult(await stopStack(stack, options), () => startStack(stack, options));
};

/**
 * Enable all containers in a stack to start on boot.
 */
export const enableStack = async (
  stack: Stack,
  options: OrchestratorOptions
): Promise<Result<void, DivbanError>> => {
  const { logger } = options;
  const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

  logger.info(`Enabling stack '${stack.name}'...`);

  const enableOps = stack.containers.map(
    (container): (() => Promise<Result<void, DivbanError>>) =>
      async (): Promise<Result<void, DivbanError>> => {
        const result = await enableService(`${container.name}.service`, systemctlOpts);
        return mapErr(
          result,
          (err) =>
            new DivbanError(
              ErrorCode.GENERAL_ERROR,
              `Failed to enable container ${container.name}`,
              err
            )
        );
      }
  );
  const enableResult = await sequence(enableOps);
  if (!enableResult.ok) {
    return enableResult;
  }

  logger.success(`Stack '${stack.name}' enabled successfully`);
  return Ok(undefined);
};

/**
 * Get status of all containers in a stack.
 */
export const getStackStatus = async (
  stack: Stack,
  options: OrchestratorOptions
): Promise<
  Result<Array<{ name: string; running: boolean; description?: string }>, DivbanError>
> => {
  const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };
  const statuses: Array<{ name: string; running: boolean; description?: string }> = [];

  for (const container of stack.containers) {
    const running = await isServiceActive(`${container.name}.service`, systemctlOpts);
    const status: { name: string; running: boolean; description?: string } = {
      name: container.name,
      running,
    };
    if (container.description !== undefined) {
      status.description = container.description;
    }
    statuses.push(status);
  }

  return Ok(statuses);
};

/**
 * Check if all containers in a stack are running.
 */
export const isStackRunning = async (
  stack: Stack,
  options: OrchestratorOptions
): Promise<boolean> => {
  const statusResult = await getStackStatus(stack, options);
  if (!statusResult.ok) {
    return false;
  }

  return statusResult.value.every((s) => s.running);
};

/**
 * Start a single container in a stack (with its dependencies).
 */
export const startContainer = async (
  stack: Stack,
  containerName: string,
  options: OrchestratorOptions
): Promise<Result<void, DivbanError>> => {
  const { logger } = options;
  const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

  const container = stack.containers.find((c) => c.name === containerName);
  if (!container) {
    return Err(
      new DivbanError(
        ErrorCode.CONTAINER_NOT_FOUND,
        `Container '${containerName}' not found in stack`
      )
    );
  }

  // Reload daemon first
  await daemonReload(systemctlOpts);

  // Start the container (systemd will handle dependencies)
  logger.info(`Starting container '${containerName}'...`);
  const result = await startService(`${containerName}.service`, systemctlOpts);

  const mapped = mapErr(
    result,
    (err) =>
      new DivbanError(
        ErrorCode.SERVICE_START_FAILED,
        `Failed to start container ${containerName}`,
        err
      )
  );
  if (!mapped.ok) {
    return mapped;
  }

  logger.success(`Container '${containerName}' started successfully`);
  return Ok(undefined);
};

/**
 * Stop a single container in a stack.
 */
export const stopContainer = async (
  _stack: Stack,
  containerName: string,
  options: OrchestratorOptions
): Promise<Result<void, DivbanError>> => {
  const { logger } = options;
  const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

  logger.info(`Stopping container '${containerName}'...`);
  const result = await stopService(`${containerName}.service`, systemctlOpts);

  const mapped = mapErr(
    result,
    (err) =>
      new DivbanError(
        ErrorCode.SERVICE_STOP_FAILED,
        `Failed to stop container ${containerName}`,
        err
      )
  );
  if (!mapped.ok) {
    return mapped;
  }

  logger.success(`Container '${containerName}' stopped successfully`);
  return Ok(undefined);
};
