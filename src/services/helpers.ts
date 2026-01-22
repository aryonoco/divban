// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Effect, type Exit, Option, type Schema, type Scope, pipe } from "effect";
import { loadServiceConfig } from "../config/loader";
import type {
  ConfigError,
  ContainerError,
  GeneralError,
  ServiceError,
  SystemError,
} from "../lib/errors";
import { configFilePath, quadletFilePath } from "../lib/paths";
import { type AbsolutePath, type GroupId, type UserId, pathWithSuffix } from "../lib/types";
import { chown } from "../system/directories";
import { copyFile, deleteFile, fileExists, renameFile, writeFile } from "../system/fs";
import {
  daemonReload,
  disableService,
  enableService,
  isServiceActive,
  isServiceEnabled,
  journalctl,
  restartService,
  startService,
  stopService,
} from "../system/systemctl";
import { AppLogger, ServicePaths, ServiceUser } from "./context";
import type { GeneratedFiles, LogOptions, ServiceStatus } from "./types";

// ============================================================================
// Core Tracking Types
// ============================================================================

/**
 * Result of an acquisition that tracks whether we created the resource.
 * Pure data - no effects.
 */
export interface Acquired<A> {
  readonly value: A;
  readonly wasCreated: boolean;
}

/**
 * Constructor for Acquired - pure function.
 */
export const acquired = <A>(value: A, wasCreated: boolean): Acquired<A> => ({
  value,
  wasCreated,
});

/**
 * Result tracking for file operations.
 */
export type FileWriteResult =
  | { readonly kind: "Created"; readonly path: AbsolutePath }
  | { readonly kind: "Modified"; readonly path: AbsolutePath; readonly backup: AbsolutePath };

/**
 * Constructors for FileWriteResult - pure functions.
 */
export const FileWriteResult = {
  created: (path: AbsolutePath): FileWriteResult => ({ kind: "Created", path }),
  modified: (path: AbsolutePath, backup: AbsolutePath): FileWriteResult => ({
    kind: "Modified",
    path,
    backup,
  }),
} as const;

/**
 * Result of writing multiple files.
 */
export interface FilesWriteResult {
  readonly results: readonly FileWriteResult[];
}

/**
 * Result of enabling services.
 */
export interface ServicesEnableResult {
  readonly newlyEnabled: readonly string[];
  readonly newlyStarted: readonly string[];
}

// ============================================================================
// Pure Derivation Functions
// ============================================================================

/**
 * Derive paths that were created (not modified) from file write results.
 */
export const createdPaths = (results: readonly FileWriteResult[]): readonly AbsolutePath[] =>
  results
    .filter((r): r is Extract<FileWriteResult, { kind: "Created" }> => r.kind === "Created")
    .map((r) => r.path);

/**
 * Derive paths that were modified (have backups) from file write results.
 */
export const modifiedPaths = (
  results: readonly FileWriteResult[]
): readonly { path: AbsolutePath; backup: AbsolutePath }[] =>
  results
    .filter((r): r is Extract<FileWriteResult, { kind: "Modified" }> => r.kind === "Modified")
    .map((r) => ({ path: r.path, backup: r.backup }));

/**
 * Backup path naming convention - pure function.
 */
export const backupPath = (path: AbsolutePath): AbsolutePath => pathWithSuffix(path, ".bak");

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
 * Dependencies accessed via Effect context.
 */
export const writeGeneratedFiles = (
  files: GeneratedFiles
): Effect.Effect<void, SystemError | GeneralError, ServicePaths | ServiceUser> =>
  Effect.gen(function* () {
    const paths = yield* ServicePaths;
    const user = yield* ServiceUser;

    const { quadletDir, configDir } = paths;
    const owner = { uid: user.uid, gid: user.gid };

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
// Effectful Resource Operations
// ============================================================================

/**
 * Write a single file with tracking.
 */
const writeFileTracked = (
  destPath: AbsolutePath,
  content: string,
  owner: { uid: UserId; gid: GroupId }
): Effect.Effect<FileWriteResult, SystemError | GeneralError> =>
  pipe(
    fileExists(destPath),
    Effect.flatMap((exists) =>
      exists
        ? pipe(
            // File exists - backup then overwrite
            copyFile(destPath, backupPath(destPath)),
            Effect.flatMap(() => writeFile(destPath, content)),
            Effect.flatMap(() => chown(destPath, owner)),
            Effect.as(FileWriteResult.modified(destPath, backupPath(destPath)))
          )
        : pipe(
            // New file - just create
            writeFile(destPath, content),
            Effect.flatMap(() => chown(destPath, owner)),
            Effect.as(FileWriteResult.created(destPath))
          )
    )
  );

/**
 * Write generated files with tracking using Effect.forEach.
 * Dependencies accessed via Effect context.
 */
export const writeGeneratedFilesTracked = (
  files: GeneratedFiles
): Effect.Effect<FilesWriteResult, SystemError | GeneralError, ServicePaths | ServiceUser> =>
  Effect.gen(function* () {
    const paths = yield* ServicePaths;
    const user = yield* ServiceUser;

    const { quadletDir, configDir } = paths;
    const owner = { uid: user.uid, gid: user.gid };

    // Collect all file entries with their destinations
    const allFiles: readonly { dest: AbsolutePath; content: string }[] = [
      ...[...files.quadlets].map(([f, c]) => ({
        dest: quadletFilePath(quadletDir, f),
        content: c,
      })),
      ...[...files.networks].map(([f, c]) => ({
        dest: quadletFilePath(quadletDir, f),
        content: c,
      })),
      ...[...files.volumes].map(([f, c]) => ({
        dest: quadletFilePath(quadletDir, f),
        content: c,
      })),
      ...[...files.environment].map(([f, c]) => ({
        dest: configFilePath(configDir, f),
        content: c,
      })),
      ...[...files.other].map(([f, c]) => ({ dest: configFilePath(configDir, f), content: c })),
    ];

    // Sequential write with tracking
    const results = yield* Effect.forEach(
      allFiles,
      ({ dest, content }) => writeFileTracked(dest, content, owner),
      { concurrency: 1 } // Sequential to maintain order
    );

    return { results };
  });

/**
 * Rollback file writes - delete created, restore modified.
 * Derives rollback actions from pure FileWriteResult data.
 */
export const rollbackFileWrites = (
  results: readonly FileWriteResult[]
): Effect.Effect<void, never> =>
  Effect.all([
    // Delete files we created
    Effect.forEach(createdPaths(results), (path) => deleteFile(path).pipe(Effect.ignore), {
      concurrency: "unbounded",
    }),
    // Restore files we modified from backup
    Effect.forEach(
      modifiedPaths(results),
      ({ path, backup }) => renameFile(backup, path).pipe(Effect.ignore),
      { concurrency: "unbounded" }
    ),
  ]).pipe(Effect.asVoid);

/**
 * Cleanup backups on success.
 */
export const cleanupFileBackups = (
  results: readonly FileWriteResult[]
): Effect.Effect<void, never> =>
  Effect.forEach(modifiedPaths(results), ({ backup }) => deleteFile(backup).pipe(Effect.ignore), {
    concurrency: "unbounded",
  }).pipe(Effect.asVoid);

/**
 * Handle file write results on release - rollback on failure, cleanup on success.
 */
export const releaseFileWrites = (
  fileResults: FilesWriteResult | undefined,
  failed: boolean
): Effect.Effect<void, never> => {
  if (!fileResults) {
    return Effect.void;
  }
  if (failed) {
    return rollbackFileWrites(fileResults.results);
  }
  return cleanupFileBackups(fileResults.results);
};

/**
 * Enable services with tracking.
 * Returns only the services we actually changed.
 * Dependencies accessed via Effect context.
 */
export const reloadAndEnableServicesTracked = (
  services: readonly string[],
  startAfterEnable = true
): Effect.Effect<ServicesEnableResult, ServiceError | SystemError | GeneralError, ServiceUser> =>
  Effect.gen(function* () {
    const user = yield* ServiceUser;
    const opts = { user: user.name, uid: user.uid };

    // Check and enable each service, collecting what we changed
    const enableIfNeeded = (
      svc: string
    ): Effect.Effect<Option.Option<string>, SystemError | GeneralError> =>
      pipe(
        isServiceEnabled(`${svc}.service`, opts),
        Effect.flatMap((enabled) =>
          enabled
            ? Effect.succeed(Option.none())
            : pipe(enableService(`${svc}.service`, opts), Effect.as(Option.some(svc)))
        )
      );

    const startIfNeeded = (
      svc: string
    ): Effect.Effect<Option.Option<string>, ServiceError | SystemError | GeneralError> =>
      pipe(
        isServiceActive(`${svc}.service`, opts),
        Effect.flatMap((active) =>
          active
            ? Effect.succeed(Option.none())
            : pipe(startService(`${svc}.service`, opts), Effect.as(Option.some(svc)))
        )
      );

    yield* daemonReload(opts);

    const results = yield* Effect.forEach(
      services,
      (svc) =>
        pipe(
          enableIfNeeded(svc),
          Effect.flatMap((enabled) =>
            startAfterEnable
              ? Effect.map(startIfNeeded(svc), (started) => ({ enabled, started }))
              : Effect.succeed({ enabled, started: Option.none() as Option.Option<string> })
          )
        ),
      { concurrency: 1 }
    );

    return {
      newlyEnabled: results
        .map((r) => r.enabled)
        .filter(Option.isSome)
        .map((o) => o.value),
      newlyStarted: results
        .map((r) => r.started)
        .filter(Option.isSome)
        .map((o) => o.value),
    };
  });

/**
 * Rollback service changes.
 * Dependencies accessed via Effect context.
 */
export const rollbackServiceChanges = (
  result: ServicesEnableResult
): Effect.Effect<void, never, ServiceUser> =>
  Effect.gen(function* () {
    const user = yield* ServiceUser;
    const opts = { user: user.name, uid: user.uid };

    yield* Effect.all([
      Effect.forEach(
        result.newlyStarted,
        (svc) => stopService(`${svc}.service`, opts).pipe(Effect.ignore),
        { concurrency: "unbounded" }
      ),
      Effect.forEach(
        result.newlyEnabled,
        (svc) => disableService(`${svc}.service`, opts).pipe(Effect.ignore),
        { concurrency: "unbounded" }
      ),
    ]);
  }).pipe(Effect.asVoid);

// ============================================================================
// Config Copy Operations
// ============================================================================

/**
 * Result of copying a config file.
 */
export interface ConfigCopyResult {
  readonly wasNewFile: boolean;
  readonly backupPath: Option.Option<AbsolutePath>;
}

/**
 * Copy config file with tracking and backup.
 */
export const copyConfigTracked = (
  source: AbsolutePath,
  dest: AbsolutePath,
  owner: { uid: UserId; gid: GroupId }
): Effect.Effect<ConfigCopyResult, SystemError | GeneralError> =>
  pipe(
    fileExists(dest),
    Effect.flatMap(
      (exists): Effect.Effect<ConfigCopyResult, SystemError | GeneralError> =>
        exists
          ? pipe(
              // Backup existing, then copy
              Effect.Do,
              Effect.bind("backup", () => Effect.succeed(backupPath(dest))),
              Effect.tap(({ backup }) => copyFile(dest, backup)),
              Effect.tap(() => copyFile(source, dest)),
              Effect.tap(() => chown(dest, owner)),
              Effect.map(
                ({ backup }): ConfigCopyResult => ({
                  wasNewFile: false,
                  backupPath: Option.some(backup),
                })
              )
            )
          : pipe(
              // New file - just copy
              copyFile(source, dest),
              Effect.flatMap(() => chown(dest, owner)),
              Effect.as<ConfigCopyResult>({
                wasNewFile: true,
                backupPath: Option.none(),
              })
            )
    )
  );

/**
 * Rollback config copy based on result.
 */
export const rollbackConfigCopy = (
  dest: AbsolutePath,
  result: ConfigCopyResult
): Effect.Effect<void, never> =>
  result.wasNewFile
    ? deleteFile(dest).pipe(Effect.ignore)
    : Option.match(result.backupPath, {
        onNone: (): Effect.Effect<void, never> => Effect.void,
        onSome: (backup): Effect.Effect<void, never> =>
          renameFile(backup, dest).pipe(Effect.ignore),
      });

/**
 * Cleanup config backup on success.
 */
export const cleanupConfigBackup = (result: ConfigCopyResult): Effect.Effect<void, never> =>
  Option.match(result.backupPath, {
    onNone: (): Effect.Effect<void, never> => Effect.void,
    onSome: (backup): Effect.Effect<void, never> => deleteFile(backup).pipe(Effect.ignore),
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
 * No ctx parameter - dependencies in R type, resolved via yield*.
 */
export interface SingleContainerOps {
  start: () => Effect.Effect<
    void,
    ServiceError | SystemError | GeneralError,
    ServiceUser | AppLogger
  >;
  stop: () => Effect.Effect<
    void,
    ServiceError | SystemError | GeneralError,
    ServiceUser | AppLogger
  >;
  restart: () => Effect.Effect<
    void,
    ServiceError | SystemError | GeneralError,
    ServiceUser | AppLogger
  >;
  status: () => Effect.Effect<
    ServiceStatus,
    ServiceError | SystemError | GeneralError,
    ServiceUser
  >;
  logs: (
    options: LogOptions
  ) => Effect.Effect<void, ServiceError | SystemError | GeneralError, ServiceUser>;
}

/**
 * Create standard start/stop/restart/status/logs for single-container services.
 * Returns operations that access dependencies via Effect context.
 */
export const createSingleContainerOps = (config: SingleContainerConfig): SingleContainerOps => {
  const unit = `${config.serviceName}.service`;

  return {
    start: (): Effect.Effect<
      void,
      ServiceError | SystemError | GeneralError,
      ServiceUser | AppLogger
    > =>
      Effect.gen(function* () {
        const user = yield* ServiceUser;
        const logger = yield* AppLogger;

        logger.info(`Starting ${config.displayName}...`);
        yield* startService(unit, { user: user.name, uid: user.uid });
        logger.success(`${config.displayName} started successfully`);
      }),

    stop: (): Effect.Effect<
      void,
      ServiceError | SystemError | GeneralError,
      ServiceUser | AppLogger
    > =>
      Effect.gen(function* () {
        const user = yield* ServiceUser;
        const logger = yield* AppLogger;

        logger.info(`Stopping ${config.displayName}...`);
        yield* stopService(unit, { user: user.name, uid: user.uid });
        logger.success(`${config.displayName} stopped successfully`);
      }),

    restart: (): Effect.Effect<
      void,
      ServiceError | SystemError | GeneralError,
      ServiceUser | AppLogger
    > =>
      Effect.gen(function* () {
        const user = yield* ServiceUser;
        const logger = yield* AppLogger;

        logger.info(`Restarting ${config.displayName}...`);
        yield* restartService(unit, { user: user.name, uid: user.uid });
        logger.success(`${config.displayName} restarted successfully`);
      }),

    status: (): Effect.Effect<
      ServiceStatus,
      ServiceError | SystemError | GeneralError,
      ServiceUser
    > =>
      Effect.gen(function* () {
        const user = yield* ServiceUser;

        const running = yield* isServiceActive(unit, { user: user.name, uid: user.uid });
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
      options: LogOptions
    ): Effect.Effect<void, ServiceError | SystemError | GeneralError, ServiceUser> =>
      Effect.gen(function* () {
        const user = yield* ServiceUser;

        yield* journalctl(unit, {
          user: user.name,
          uid: user.uid,
          follow: options.follow,
          lines: options.lines,
        });
      }),
  };
};

// ============================================================================
// Backup Helper
// ============================================================================

/**
 * Wrap a backup function to return BackupResult with file stats.
 * Uses stat() for accurate file size instead of lazy .size property.
 */
export const wrapBackupResult = <E>(
  backupFn: Effect.Effect<AbsolutePath, E>
): Effect.Effect<{ path: AbsolutePath; size: number; timestamp: Date }, E> =>
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
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void needed for Effect<void> compatibility
export type SetupStepAcquireResult<S, E, R = never> = Effect.Effect<Partial<S> | void, E, R>;

/**
 * Setup step definition using Effect resource pattern.
 * Steps run sequentially. If a step returns data, it's stored in state.
 * Uses acquireRelease for automatic rollback on failure.
 * Generic over R - steps declare their own dependencies.
 */
export interface SetupStepResource<
  S = object,
  E = SystemError | GeneralError | ServiceError,
  R = never,
> {
  /** Step message for logger.step() */
  message: string;
  /** Acquire the resource. Can read from state and return data to add to state. */
  acquire: (state: S) => SetupStepAcquireResult<S, E, R>;
  /** Release function called on scope close. Receives Exit to check success/failure. */
  release?: (state: S, exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void, never, R>;
}

/**
 * Execute a single setup step within scope.
 * Returns Effect requiring Scope when step has release function.
 */
const executeStep = <S extends object, E, R>(
  step: SetupStepResource<S, E, R>,
  state: S,
  stepNumber: number,
  totalSteps: number
): Effect.Effect<S, E, Scope.Scope | R | AppLogger> =>
  Effect.gen(function* () {
    const logger = yield* AppLogger;
    logger.step(stepNumber, totalSteps, step.message);

    // Capture state for release closure (immutable snapshot)
    const capturedState = { ...state };

    // Bind release to const for proper narrowing
    const releaseHandler = step.release;

    const runStep = releaseHandler
      ? Effect.acquireRelease(step.acquire(state), (_, exit) => releaseHandler(capturedState, exit))
      : step.acquire(state);

    const result = yield* runStep;

    // Merge result into state if it's an object, otherwise return unchanged state
    return result !== null && result !== undefined && typeof result === "object"
      ? { ...state, ...(result as Partial<S>) }
      : state;
  });

/**
 * Execute setup steps sequentially using Effect's Scope for automatic rollback.
 * Each step's returned data is merged into state for subsequent steps.
 * On failure, release functions are executed in reverse order by the Scope.
 * On success, release functions can perform cleanup (e.g., removing backups).
 * Dependencies accessed via Effect context.
 */
export const executeSetupStepsScoped = <
  S extends object = object,
  E extends SystemError | GeneralError | ServiceError | ContainerError =
    | SystemError
    | GeneralError
    | ServiceError
    | ContainerError,
  R = never,
>(
  steps: readonly SetupStepResource<S, E, R>[],
  initialState: S
): Effect.Effect<void, E, R | AppLogger> =>
  Effect.scoped(
    pipe(
      // Zip steps with their indices (1-based for display)
      steps.map((step, index) => [step, index] as const),
      // Effectful fold: thread state through each step
      (indexedSteps) =>
        Effect.reduce(indexedSteps, initialState, (state, [step, index]) =>
          executeStep(step, state, index + 1, steps.length)
        ),
      // Discard final state, log success
      Effect.flatMap(() =>
        Effect.gen(function* () {
          const logger = yield* AppLogger;
          logger.success("Setup completed successfully");
        })
      )
    )
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
