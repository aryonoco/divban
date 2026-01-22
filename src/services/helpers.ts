// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Effect, Exit, Option, type Schema, type Scope, pipe } from "effect";
import { loadServiceConfig } from "../config/loader";
import type { ConfigError, GeneralError, ServiceError, SystemError } from "../lib/errors";
import { configFilePath, quadletFilePath } from "../lib/paths";
import {
  type AbsolutePath,
  type GroupId,
  type ServiceName,
  type UserId,
  pathWithSuffix,
} from "../lib/types";
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
  serviceName: ServiceName;
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
// Outcome Type (Typed Alternative to Exit<unknown, unknown>)
// ============================================================================

/**
 * Outcome discriminant - avoids unknown in release signatures.
 * A simple sum type for success/failure branching.
 */
export type Outcome = { readonly _tag: "Success" } | { readonly _tag: "Failure" };

type OutcomeSuccess = { readonly _tag: "Success" };
type OutcomeFailure = { readonly _tag: "Failure" };

interface OutcomeOps {
  readonly success: OutcomeSuccess;
  readonly failure: OutcomeFailure;
  readonly fromExit: <A, E>(exit: Exit.Exit<A, E>) => Outcome;
  readonly match: <A>(
    outcome: Outcome,
    cases: { readonly onSuccess: () => A; readonly onFailure: () => A }
  ) => A;
}

export const Outcome: OutcomeOps = {
  // biome-ignore lint/style/useNamingConvention: _tag is standard Effect-ts discriminant
  success: { _tag: "Success" },
  // biome-ignore lint/style/useNamingConvention: _tag is standard Effect-ts discriminant
  failure: { _tag: "Failure" },

  fromExit: <A, E>(exit: Exit.Exit<A, E>): Outcome =>
    Exit.match(exit, {
      onSuccess: (): Outcome => Outcome.success,
      onFailure: (): Outcome => Outcome.failure,
    }),

  match: <A>(
    outcome: Outcome,
    cases: {
      readonly onSuccess: () => A;
      readonly onFailure: () => A;
    }
  ): A => (outcome._tag === "Success" ? cases.onSuccess() : cases.onFailure()),
};

// ============================================================================
// Setup Step with Explicit State Types
// ============================================================================

/**
 * Release function receives exact state shape at release time.
 * Must not fail (Effect<void, never, R>).
 */
type Release<State, R> = (state: State, outcome: Outcome) => Effect.Effect<void, never, R>;

/**
 * Setup step with explicit input and output types.
 *
 * @template StateIn - Required state (what this step needs)
 * @template Output - What this step produces (added to state)
 * @template E - Error type
 * @template R - Effect requirements
 */
export interface SetupStep<StateIn, Output, E, R> {
  readonly message: string;
  readonly acquire: (state: StateIn) => Effect.Effect<Output, E, R>;
  readonly release: Option.Option<Release<StateIn & Output, R>>;
}

/**
 * Constructors - explicit distinction between pure and resource steps.
 */
export const SetupStep = {
  /** Pure computation - no cleanup needed */
  pure: <StateIn, Output, E, R>(
    message: string,
    acquire: (state: StateIn) => Effect.Effect<Output, E, R>
  ): SetupStep<StateIn, Output, E, R> => ({
    message,
    acquire,
    release: Option.none(),
  }),

  /** Resource acquisition - cleanup on scope exit */
  resource: <StateIn, Output, E, R>(
    message: string,
    acquire: (state: StateIn) => Effect.Effect<Output, E, R>,
    release: Release<StateIn & Output, R>
  ): SetupStep<StateIn, Output, E, R> => ({
    message,
    acquire,
    release: Option.some(release),
  }),
} as const;

// ============================================================================
// Base State and Accumulation
// ============================================================================

/**
 * Empty state - branded to prevent accidental extension.
 * All pipelines start here.
 */
export interface EmptyState {
  readonly __brand: "EmptyState";
}

// biome-ignore lint/style/useNamingConvention: __brand is standard TypeScript branding pattern
export const emptyState: EmptyState = { __brand: "EmptyState" };

// ============================================================================
// Combinators - Functional Composition
// ============================================================================

/**
 * Sequence two steps, accumulating state via intersection.
 *
 * Release functions have different state requirements:
 * - first.release expects StateIn & B
 * - second.release expects StateIn & B & C
 *
 * Since StateIn & B & C is assignable to StateIn & B (has all properties),
 * we can safely call first.release with the combined state.
 */
const andThen = <StateIn, B, C, E1, E2, R1, R2>(
  first: SetupStep<StateIn, B, E1, R1>,
  second: SetupStep<StateIn & B, C, E2, R2>
): SetupStep<StateIn, B & C, E1 | E2, R1 | R2> => ({
  message: first.message,
  acquire: (stateIn: StateIn): Effect.Effect<B & C, E1 | E2, R1 | R2> =>
    pipe(
      first.acquire(stateIn),
      Effect.flatMap((b: B) =>
        pipe(
          second.acquire({ ...stateIn, ...b }),
          Effect.map((c: C): B & C => ({ ...b, ...c }))
        )
      )
    ),
  release: pipe(
    Option.all([first.release, second.release]),
    Option.map(
      ([r1, r2]): Release<StateIn & B & C, R1 | R2> =>
        (state: StateIn & B & C, outcome: Outcome): Effect.Effect<void, never, R1 | R2> =>
          pipe(
            r2(state, outcome),
            Effect.flatMap(() => r1(state, outcome))
          )
    ),
    Option.orElse(() =>
      Option.map(
        second.release,
        (r): Release<StateIn & B & C, R1 | R2> =>
          (state: StateIn & B & C, outcome: Outcome): Effect.Effect<void, never, R2> =>
            r(state, outcome)
      )
    ),
    Option.orElse(() =>
      Option.map(
        first.release,
        (r): Release<StateIn & B & C, R1 | R2> =>
          (state: StateIn & B & C, outcome: Outcome): Effect.Effect<void, never, R1> =>
            r(state, outcome)
      )
    )
  ),
});

/**
 * Fixed-arity pipeline constructors.
 * TypeScript cannot express variadic type-level folds,
 * so we provide explicit arities.
 */
export const pipeline2 = <S, A, B, E1, E2, R1, R2>(
  s1: SetupStep<S, A, E1, R1>,
  s2: SetupStep<S & A, B, E2, R2>
): SetupStep<S, A & B, E1 | E2, R1 | R2> => andThen(s1, s2);

export const pipeline3 = <S, A, B, C, E1, E2, E3, R1, R2, R3>(
  s1: SetupStep<S, A, E1, R1>,
  s2: SetupStep<S & A, B, E2, R2>,
  s3: SetupStep<S & A & B, C, E3, R3>
): SetupStep<S, A & B & C, E1 | E2 | E3, R1 | R2 | R3> => andThen(andThen(s1, s2), s3);

export const pipeline4 = <S, A, B, C, D, E1, E2, E3, E4, R1, R2, R3, R4>(
  s1: SetupStep<S, A, E1, R1>,
  s2: SetupStep<S & A, B, E2, R2>,
  s3: SetupStep<S & A & B, C, E3, R3>,
  s4: SetupStep<S & A & B & C, D, E4, R4>
): SetupStep<S, A & B & C & D, E1 | E2 | E3 | E4, R1 | R2 | R3 | R4> =>
  andThen(andThen(andThen(s1, s2), s3), s4);

export const pipeline5 = <S, A, B, C, D, E, E1, E2, E3, E4, E5, R1, R2, R3, R4, R5>(
  s1: SetupStep<S, A, E1, R1>,
  s2: SetupStep<S & A, B, E2, R2>,
  s3: SetupStep<S & A & B, C, E3, R3>,
  s4: SetupStep<S & A & B & C, D, E4, R4>,
  s5: SetupStep<S & A & B & C & D, E, E5, R5>
): SetupStep<S, A & B & C & D & E, E1 | E2 | E3 | E4 | E5, R1 | R2 | R3 | R4 | R5> =>
  andThen(andThen(andThen(andThen(s1, s2), s3), s4), s5);

// ============================================================================
// Execution with Effect.scoped
// ============================================================================

/**
 * Execute a step within scope, registering release as finalizer.
 */
const executeStepScoped = <StateIn, Output, E, R>(
  step: SetupStep<StateIn, Output, E, R>,
  stateIn: StateIn,
  stepNumber: number,
  totalSteps: number
): Effect.Effect<StateIn & Output, E, Scope.Scope | R | AppLogger> =>
  Effect.gen(function* () {
    const logger = yield* AppLogger;
    logger.step(stepNumber, totalSteps, step.message);

    // Immutable snapshot for release closure
    const capturedStateIn: StateIn = { ...stateIn };

    const output: Output = yield* pipe(
      step.release,
      Option.match({
        onNone: (): Effect.Effect<Output, E, R> => step.acquire(stateIn),
        onSome: (release): Effect.Effect<Output, E, Scope.Scope | R> =>
          Effect.acquireRelease(step.acquire(stateIn), (output: Output, exit) =>
            release({ ...capturedStateIn, ...output }, Outcome.fromExit(exit))
          ),
      })
    );

    return { ...stateIn, ...output };
  });

/**
 * Execute steps with per-step progress logging.
 * Uses sequential Effect.gen bindings (no loops).
 * Fixed-arity versions for 3, 4, and 5 steps with per-step type parameters.
 */
export const executeSteps3 = <S, A, B, C, E1, E2, E3, R1, R2, R3>(
  steps: readonly [
    SetupStep<S, A, E1, R1>,
    SetupStep<S & A, B, E2, R2>,
    SetupStep<S & A & B, C, E3, R3>,
  ],
  initialState: S
): Effect.Effect<void, E1 | E2 | E3, R1 | R2 | R3 | AppLogger> =>
  Effect.scoped(
    Effect.gen(function* () {
      const [s1, s2, s3] = steps;
      const state1 = yield* executeStepScoped(s1, initialState, 1, 3);
      const state2 = yield* executeStepScoped(s2, state1, 2, 3);
      yield* executeStepScoped(s3, state2, 3, 3);
      const logger = yield* AppLogger;
      logger.success("Setup completed successfully");
    })
  );

export const executeSteps4 = <S, A, B, C, D, E1, E2, E3, E4, R1, R2, R3, R4>(
  steps: readonly [
    SetupStep<S, A, E1, R1>,
    SetupStep<S & A, B, E2, R2>,
    SetupStep<S & A & B, C, E3, R3>,
    SetupStep<S & A & B & C, D, E4, R4>,
  ],
  initialState: S
): Effect.Effect<void, E1 | E2 | E3 | E4, R1 | R2 | R3 | R4 | AppLogger> =>
  Effect.scoped(
    Effect.gen(function* () {
      const [s1, s2, s3, s4] = steps;
      const state1 = yield* executeStepScoped(s1, initialState, 1, 4);
      const state2 = yield* executeStepScoped(s2, state1, 2, 4);
      const state3 = yield* executeStepScoped(s3, state2, 3, 4);
      yield* executeStepScoped(s4, state3, 4, 4);
      const logger = yield* AppLogger;
      logger.success("Setup completed successfully");
    })
  );

export const executeSteps5 = <S, A, B, C, D, E, E1, E2, E3, E4, E5, R1, R2, R3, R4, R5>(
  steps: readonly [
    SetupStep<S, A, E1, R1>,
    SetupStep<S & A, B, E2, R2>,
    SetupStep<S & A & B, C, E3, R3>,
    SetupStep<S & A & B & C, D, E4, R4>,
    SetupStep<S & A & B & C & D, E, E5, R5>,
  ],
  initialState: S
): Effect.Effect<void, E1 | E2 | E3 | E4 | E5, R1 | R2 | R3 | R4 | R5 | AppLogger> =>
  Effect.scoped(
    Effect.gen(function* () {
      const [s1, s2, s3, s4, s5] = steps;
      const state1 = yield* executeStepScoped(s1, initialState, 1, 5);
      const state2 = yield* executeStepScoped(s2, state1, 2, 5);
      const state3 = yield* executeStepScoped(s3, state2, 3, 5);
      const state4 = yield* executeStepScoped(s4, state3, 4, 5);
      yield* executeStepScoped(s5, state4, 5, 5);
      const logger = yield* AppLogger;
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
