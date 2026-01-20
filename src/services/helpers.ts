// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based service implementation helpers to reduce code duplication.
 */

import { Effect, Exit, type Schema } from "effect";
import { loadServiceConfig } from "../config/loader";
import type {
  ConfigError,
  ContainerError,
  GeneralError,
  ServiceError,
  SystemError,
} from "../lib/errors";
import { configFilePath, quadletFilePath } from "../lib/paths";
import type { AbsolutePath, GroupId, UserId } from "../lib/types";
import { chown } from "../system/directories";
import { writeFile } from "../system/fs";
import {
  daemonReload,
  enableService,
  isServiceActive,
  journalctl,
  restartService,
  startService,
  stopService,
} from "../system/systemctl";
import type {
  BackupResult,
  GeneratedFiles,
  LogOptions,
  ServiceContext,
  ServiceStatus,
} from "./types";

// ============================================================================
// File Writing Helpers
// ============================================================================

/**
 * Write a file and set ownership.
 */
const writeAndOwn = (
  path: AbsolutePath,
  content: string,
  owner: { uid: UserId; gid: GroupId }
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* writeFile(path, content);
    yield* chown(path, owner);
  });

/**
 * Write all generated files to their destinations.
 */
export const writeGeneratedFiles = <C>(
  files: GeneratedFiles,
  ctx: ServiceContext<C>
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { quadletDir, configDir } = ctx.paths;
    const owner = { uid: ctx.user.uid, gid: ctx.user.gid };

    // Collect all write operations
    const quadletOps = [...files.quadlets].map(([filename, content]) =>
      writeAndOwn(quadletFilePath(quadletDir, filename), content, owner)
    );
    const networkOps = [...files.networks].map(([filename, content]) =>
      writeAndOwn(quadletFilePath(quadletDir, filename), content, owner)
    );
    const volumeOps = [...files.volumes].map(([filename, content]) =>
      writeAndOwn(quadletFilePath(quadletDir, filename), content, owner)
    );
    const envOps = [...files.environment].map(([filename, content]) =>
      writeAndOwn(configFilePath(configDir, filename), content, owner)
    );
    const otherOps = [...files.other].map(([filename, content]) =>
      writeAndOwn(configFilePath(configDir, filename), content, owner)
    );

    // Execute all sequentially
    const allOps = [...quadletOps, ...networkOps, ...volumeOps, ...envOps, ...otherOps];
    yield* Effect.all(allOps, { concurrency: 1 });
  });

// ============================================================================
// Single-Container Service Operations
// ============================================================================

export interface SingleContainerConfig {
  serviceName: string;
  displayName: string;
}

/**
 * Operations returned by createSingleContainerOps.
 */
export interface SingleContainerOpsEffect<C> {
  start: (ctx: ServiceContext<C>) => Effect.Effect<void, ServiceError | SystemError | GeneralError>;
  stop: (ctx: ServiceContext<C>) => Effect.Effect<void, ServiceError | SystemError | GeneralError>;
  restart: (
    ctx: ServiceContext<C>
  ) => Effect.Effect<void, ServiceError | SystemError | GeneralError>;
  status: (
    ctx: ServiceContext<C>
  ) => Effect.Effect<ServiceStatus, ServiceError | SystemError | GeneralError>;
  logs: (
    ctx: ServiceContext<C>,
    options: LogOptions
  ) => Effect.Effect<void, ServiceError | SystemError | GeneralError>;
}

/**
 * Create standard start/stop/restart/status/logs for single-container services.
 */
export const createSingleContainerOps = <C>(
  config: SingleContainerConfig
): SingleContainerOpsEffect<C> => {
  const unit = `${config.serviceName}.service`;

  return {
    start: (
      ctx: ServiceContext<C>
    ): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
      Effect.gen(function* () {
        ctx.logger.info(`Starting ${config.displayName}...`);
        yield* startService(unit, { user: ctx.user.name, uid: ctx.user.uid });
        ctx.logger.success(`${config.displayName} started successfully`);
      }),

    stop: (
      ctx: ServiceContext<C>
    ): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
      Effect.gen(function* () {
        ctx.logger.info(`Stopping ${config.displayName}...`);
        yield* stopService(unit, { user: ctx.user.name, uid: ctx.user.uid });
        ctx.logger.success(`${config.displayName} stopped successfully`);
      }),

    restart: (
      ctx: ServiceContext<C>
    ): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
      Effect.gen(function* () {
        ctx.logger.info(`Restarting ${config.displayName}...`);
        yield* restartService(unit, { user: ctx.user.name, uid: ctx.user.uid });
        ctx.logger.success(`${config.displayName} restarted successfully`);
      }),

    status: (
      ctx: ServiceContext<C>
    ): Effect.Effect<ServiceStatus, ServiceError | SystemError | GeneralError> =>
      Effect.gen(function* () {
        const running = yield* isServiceActive(unit, { user: ctx.user.name, uid: ctx.user.uid });
        return {
          running,
          containers: [
            {
              name: config.serviceName,
              status: running ? { status: "running" } : { status: "stopped" },
            },
          ],
        };
      }),

    logs: (
      ctx: ServiceContext<C>,
      options: LogOptions
    ): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
      journalctl(unit, {
        user: ctx.user.name,
        uid: ctx.user.uid,
        follow: options.follow,
        lines: options.lines,
      }),
  };
};

// ============================================================================
// Systemd Helpers
// ============================================================================

/**
 * Reload daemon, enable services, optionally start them.
 */
export const reloadAndEnableServices = <C>(
  ctx: ServiceContext<C>,
  services: string[],
  startAfterEnable = true
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const opts = { user: ctx.user.name, uid: ctx.user.uid };

    yield* daemonReload(opts);

    for (const svc of services) {
      yield* enableService(`${svc}.service`, opts);
      if (startAfterEnable) {
        yield* startService(`${svc}.service`, opts);
      }
    }
  });

// ============================================================================
// Backup Helper
// ============================================================================

/**
 * Wrap a backup function to return BackupResult with file stats.
 * Uses stat() for accurate file size instead of lazy .size property.
 */
export const wrapBackupResult = <E>(
  backupFn: Effect.Effect<AbsolutePath, E>
): Effect.Effect<BackupResult, E> =>
  Effect.gen(function* () {
    const path = yield* backupFn;
    const stat = yield* Effect.promise(() => Bun.file(path).stat());
    return {
      path,
      size: stat?.size ?? 0,
      timestamp: new Date(),
    };
  });

// ============================================================================
// Setup Step Executor
// ============================================================================

/**
 * Return type for setup step acquire functions.
 * Uses void to allow steps that return Effect<void> from helper functions.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void needed for Effect<void> compatibility
export type SetupStepAcquireResult<S, E> = Effect.Effect<Partial<S> | void, E>;

/**
 * Setup step definition using Effect resource pattern.
 * Steps run sequentially. If a step returns data, it's stored in state.
 * Uses acquireRelease for automatic rollback on failure.
 */
export interface SetupStepResource<C, S = object, E = SystemError | GeneralError | ServiceError> {
  /** Step message for logger.step() */
  message: string;
  /** Acquire the resource. Can read from state and return data to add to state. */
  acquire: (ctx: ServiceContext<C>, state: S) => SetupStepAcquireResult<S, E>;
  /** Release function called on scope close. Receives Exit to check success/failure. */
  release?: (
    ctx: ServiceContext<C>,
    state: S,
    exit: Exit.Exit<unknown, unknown>
  ) => Effect.Effect<void, never>;
}

/**
 * Execute setup steps sequentially using Effect's Scope for automatic rollback.
 * Each step's returned data is merged into state for subsequent steps.
 * On failure, release functions are executed in reverse order by the Scope.
 */
export const executeSetupStepsScoped = <
  C,
  S = object,
  E extends SystemError | GeneralError | ServiceError | ContainerError =
    | SystemError
    | GeneralError
    | ServiceError
    | ContainerError,
>(
  ctx: ServiceContext<C>,
  steps: SetupStepResource<C, S, E>[],
  initialState: S = {} as S
): Effect.Effect<void, E> =>
  Effect.scoped(
    Effect.gen(function* () {
      const { logger } = ctx;
      const totalSteps = steps.length;

      let state = { ...initialState };
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step) {
          continue;
        }

        logger.step(i + 1, totalSteps, step.message);

        if (step.release) {
          // Capture state and release function at this point for the closure
          const capturedState = { ...state };
          const releaseFunc = step.release;
          const result = yield* Effect.acquireRelease(step.acquire(ctx, state), (_, exit) =>
            Exit.isFailure(exit) ? releaseFunc(ctx, capturedState, exit) : Effect.void
          );
          if (result && typeof result === "object") {
            state = { ...state, ...result };
          }
        } else {
          const result = yield* step.acquire(ctx, state);
          if (result && typeof result === "object") {
            state = { ...state, ...result };
          }
        }
      }

      logger.success("Setup completed successfully");
    })
  );

// ============================================================================
// Config Validator Factory
// ============================================================================

/**
 * Create a config validator function for a service.
 * Reduces boilerplate for the identical validate function in each service.
 */
export const createConfigValidator =
  <A, I = A>(
    schema: Schema.Schema<A, I, never>
  ): ((configPath: AbsolutePath) => Effect.Effect<void, ConfigError | SystemError>) =>
  (configPath): Effect.Effect<void, ConfigError | SystemError> =>
    Effect.map(loadServiceConfig(configPath, schema), () => undefined);

// ============================================================================
// Preview File Writing
// ============================================================================

/**
 * Write generated files without ownership changes (for preview/generate commands).
 */
export const writeGeneratedFilesPreview = (
  files: GeneratedFiles,
  quadletDir: AbsolutePath,
  configDir: AbsolutePath
): Effect.Effect<void, SystemError> =>
  Effect.gen(function* () {
    // Collect all write operations
    const quadletOps = [...files.quadlets].map(([filename, content]) =>
      writeFile(quadletFilePath(quadletDir, filename), content)
    );
    const networkOps = [...files.networks].map(([filename, content]) =>
      writeFile(quadletFilePath(quadletDir, filename), content)
    );
    const volumeOps = [...files.volumes].map(([filename, content]) =>
      writeFile(quadletFilePath(quadletDir, filename), content)
    );
    const envOps = [...files.environment].map(([filename, content]) =>
      writeFile(configFilePath(configDir, filename), content)
    );
    const otherOps = [...files.other].map(([filename, content]) =>
      writeFile(configFilePath(configDir, filename), content)
    );

    // Execute all sequentially
    const allOps = [...quadletOps, ...networkOps, ...volumeOps, ...envOps, ...otherOps];
    yield* Effect.all(allOps, { concurrency: 1 });
  });
