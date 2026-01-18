/**
 * Stack orchestration for starting, stopping, and managing multi-container stacks.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { Err, Ok, type Result, collectResults } from "../lib/result";
import type { Logger } from "../lib/logger";
import type { UserId, Username } from "../lib/types";
import {
  daemonReload,
  enableService,
  isServiceActive,
  restartService,
  startService,
  stopService,
  type SystemctlOptions,
} from "../system/systemctl";
import { resolveStartOrder, resolveStopOrder } from "./dependencies";
import type { Stack, StackContainer } from "./types";

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
  const { logger, parallel = true } = options;
  const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

  // Resolve start order
  const orderResult = resolveStartOrder(stack.containers);
  if (!orderResult.ok) return orderResult;

  const { levels } = orderResult.value;

  // Reload daemon first
  logger.info("Reloading systemd daemon...");
  const reloadResult = await daemonReload(systemctlOpts);
  if (!reloadResult.ok) return reloadResult;

  // Start containers level by level
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    if (!level) continue;

    logger.step(i + 1, levels.length, `Starting level ${i + 1}: ${level.join(", ")}`);

    if (parallel && level.length > 1) {
      // Start all containers in this level in parallel
      const results = await Promise.all(
        level.map((name) => startService(`${name}.service`, systemctlOpts))
      );
      const collected = collectResults(results);
      if (!collected.ok) return collected;
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
  const { logger, parallel = true } = options;
  const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

  // Resolve stop order (reverse of start)
  const orderResult = resolveStopOrder(stack.containers);
  if (!orderResult.ok) return orderResult;

  const { levels } = orderResult.value;

  // Stop containers level by level
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    if (!level) continue;

    logger.step(i + 1, levels.length, `Stopping level ${i + 1}: ${level.join(", ")}`);

    if (parallel && level.length > 1) {
      // Stop all containers in this level in parallel
      const results = await Promise.all(
        level.map((name) => stopService(`${name}.service`, systemctlOpts))
      );
      const collected = collectResults(results);
      if (!collected.ok) return collected;
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
  const stopResult = await stopStack(stack, options);
  if (!stopResult.ok) return stopResult;

  return startStack(stack, options);
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

  for (const container of stack.containers) {
    const result = await enableService(`${container.name}.service`, systemctlOpts);
    if (!result.ok) {
      return Err(
        new DivbanError(
          ErrorCode.GENERAL_ERROR,
          `Failed to enable container ${container.name}`,
          result.error
        )
      );
    }
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
  Result<
    Array<{ name: string; running: boolean; description?: string }>,
    DivbanError
  >
> => {
  const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };
  const statuses: Array<{ name: string; running: boolean; description?: string }> = [];

  for (const container of stack.containers) {
    const running = await isServiceActive(`${container.name}.service`, systemctlOpts);
    statuses.push({
      name: container.name,
      running,
      description: container.description,
    });
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
  if (!statusResult.ok) return false;

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
      new DivbanError(ErrorCode.CONTAINER_NOT_FOUND, `Container '${containerName}' not found in stack`)
    );
  }

  // Reload daemon first
  await daemonReload(systemctlOpts);

  // Start the container (systemd will handle dependencies)
  logger.info(`Starting container '${containerName}'...`);
  const result = await startService(`${containerName}.service`, systemctlOpts);

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_START_FAILED,
        `Failed to start container ${containerName}`,
        result.error
      )
    );
  }

  logger.success(`Container '${containerName}' started successfully`);
  return Ok(undefined);
};

/**
 * Stop a single container in a stack.
 */
export const stopContainer = async (
  stack: Stack,
  containerName: string,
  options: OrchestratorOptions
): Promise<Result<void, DivbanError>> => {
  const { logger } = options;
  const systemctlOpts: SystemctlOptions = { user: options.user, uid: options.uid };

  logger.info(`Stopping container '${containerName}'...`);
  const result = await stopService(`${containerName}.service`, systemctlOpts);

  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_STOP_FAILED,
        `Failed to stop container ${containerName}`,
        result.error
      )
    );
  }

  logger.success(`Container '${containerName}' stopped successfully`);
  return Ok(undefined);
};
