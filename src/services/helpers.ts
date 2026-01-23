// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Setup pipeline with automatic rollback. Steps execute sequentially,
 * tracking what was created vs already existed. On failure, release
 * functions run in reverse order, cleaning up only newly-created
 * resources. The Acquired<A> pattern enables idempotent setup - re-running
 * setup skips existing resources and doesn't delete them on rollback.
 */

import { Array as Arr, Data, Effect, Exit, Option, type Schema, type Scope, pipe } from "effect";
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

export interface Acquired<A> {
  readonly value: A;
  readonly wasCreated: boolean;
}

export const acquired = <A>(value: A, wasCreated: boolean): Acquired<A> => ({
  value,
  wasCreated,
});

export type FileWriteResult =
  | { readonly kind: "Created"; readonly path: AbsolutePath }
  | { readonly kind: "Modified"; readonly path: AbsolutePath; readonly backup: AbsolutePath };

export const FileWriteResult = {
  created: (path: AbsolutePath): FileWriteResult => ({ kind: "Created", path }),
  modified: (path: AbsolutePath, backup: AbsolutePath): FileWriteResult => ({
    kind: "Modified",
    path,
    backup,
  }),
} as const;

export interface FilesWriteResult {
  readonly results: readonly FileWriteResult[];
}

export interface ServicesEnableResult {
  readonly newlyEnabled: readonly string[];
  readonly newlyStarted: readonly string[];
}

// ============================================================================
// Derivation Functions
// ============================================================================

export const createdPaths = (results: readonly FileWriteResult[]): readonly AbsolutePath[] =>
  results
    .filter((r): r is Extract<FileWriteResult, { kind: "Created" }> => r.kind === "Created")
    .map((r) => r.path);

export const modifiedPaths = (
  results: readonly FileWriteResult[]
): readonly { path: AbsolutePath; backup: AbsolutePath }[] =>
  results
    .filter((r): r is Extract<FileWriteResult, { kind: "Modified" }> => r.kind === "Modified")
    .map((r) => ({ path: r.path, backup: r.backup }));

export const backupPath = (path: AbsolutePath): AbsolutePath => pathWithSuffix(path, ".bak");

// ============================================================================
// File Writing Helpers
// ============================================================================

const writeAndOwn = (
  path: AbsolutePath,
  content: string,
  owner: { uid: UserId; gid: GroupId }
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* writeFile(path, content);
    yield* chown(path, owner);
  });

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

    const allOps = [...quadletOps, ...networkOps, ...volumeOps, ...envOps, ...otherOps];
    yield* Effect.all(allOps, { concurrency: 1 });
  });

// ============================================================================
// Effectful Resource Operations
// ============================================================================

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

export const writeGeneratedFilesTracked = (
  files: GeneratedFiles
): Effect.Effect<FilesWriteResult, SystemError | GeneralError, ServicePaths | ServiceUser> =>
  Effect.gen(function* () {
    const paths = yield* ServicePaths;
    const user = yield* ServiceUser;

    const { quadletDir, configDir } = paths;
    const owner = { uid: user.uid, gid: user.gid };

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

    const results = yield* Effect.forEach(
      allFiles,
      ({ dest, content }) => writeFileTracked(dest, content, owner),
      { concurrency: 1 } // Sequential to maintain order
    );

    return { results };
  });

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

export const cleanupFileBackups = (
  results: readonly FileWriteResult[]
): Effect.Effect<void, never> =>
  Effect.forEach(modifiedPaths(results), ({ backup }) => deleteFile(backup).pipe(Effect.ignore), {
    concurrency: "unbounded",
  }).pipe(Effect.asVoid);

export const reloadAndEnableServicesTracked = (
  services: readonly string[],
  startAfterEnable = true
): Effect.Effect<ServicesEnableResult, ServiceError | SystemError | GeneralError, ServiceUser> =>
  Effect.gen(function* () {
    const user = yield* ServiceUser;
    const opts = { user: user.name, uid: user.uid };

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

export interface ConfigCopyResult {
  readonly wasNewFile: boolean;
  readonly backupPath: Option.Option<AbsolutePath>;
}

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
 * Uses Data.TaggedEnum for idiomatic _tag generation.
 */
export type Outcome = Data.TaggedEnum<{
  Success: {};
  Failure: {};
}>;

const { Success, Failure, $match } = Data.taggedEnum<Outcome>();

interface OutcomeOps {
  readonly success: Outcome;
  readonly failure: Outcome;
  readonly fromExit: <A, E>(exit: Exit.Exit<A, E>) => Outcome;
  readonly match: <A>(
    outcome: Outcome,
    cases: { readonly onSuccess: () => A; readonly onFailure: () => A }
  ) => A;
}

export const Outcome: OutcomeOps = {
  success: Success(),
  failure: Failure(),

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
  ): A => $match({ Success: cases.onSuccess, Failure: cases.onFailure })(outcome) as A,
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
 * Uses symbol-based brand to avoid naming convention lint.
 */
const EmptyStateBrand: unique symbol = Symbol.for("divban/EmptyState");

export interface EmptyState {
  readonly [EmptyStateBrand]: typeof EmptyStateBrand;
}

export const emptyState: EmptyState = {
  [EmptyStateBrand]: EmptyStateBrand,
};

// ============================================================================
// Pipeline Builder Pattern
// ============================================================================

/**
 * Fluent builder for composing setup pipelines.
 * Each `.then()` call accumulates state, errors, and requirements.
 *
 * @template S - Initial state type
 * @template Acc - Accumulated output from all steps
 * @template E - Accumulated error union
 * @template R - Accumulated requirements union
 */
export interface PipelineBuilder<S, Acc, E, R> {
  /**
   * Append a step to the pipeline.
   * Step's input must be compatible with S & Acc.
   * Named `andThen` to avoid creating a "thenable" object that interferes with Promises.
   */
  readonly andThen: <Output, E2, R2>(
    step: SetupStep<S & Acc, Output, E2, R2>
  ) => PipelineBuilder<S, Acc & Output, E | E2, R | R2>;

  /**
   * Execute the pipeline within a scope.
   * Registers finalizers for resource cleanup.
   */
  readonly execute: (initialState: S) => Effect.Effect<void, E, R | AppLogger>;

  /**
   * Get the number of steps in the pipeline.
   * Useful for progress logging.
   */
  readonly stepCount: number;
}

/**
 * Internal representation of a step for runtime execution.
 * TypeScript can't track accumulated state types across arbitrary-length step arrays.
 * The builder preserves type safety at each .andThen() call, but internally we store
 * steps with erased types.
 */
interface StoredStep {
  readonly message: string;
  readonly acquire: (state: object) => Effect.Effect<object, unknown, unknown>;
  readonly release: Option.Option<
    (state: object, outcome: Outcome) => Effect.Effect<void, never, unknown>
  >;
}

interface IndexedStep {
  readonly step: StoredStep;
  readonly index: number;
}

/**
 * Execute a single step within scope, registering release as finalizer.
 * Uses Option.match for exhaustive handling of release presence.
 *
 * The cast is necessary because Effect.gen cannot infer the full context type
 * when mixing AppLogger with dynamic step requirements (unknown from StoredStep).
 */
const executeOneStep = (
  step: StoredStep,
  stateIn: object,
  stepNumber: number,
  totalSteps: number
): Effect.Effect<object, unknown, Scope.Scope | AppLogger> =>
  Effect.gen(function* () {
    const logger = yield* AppLogger;
    logger.step(stepNumber, totalSteps, step.message);

    // Immutable snapshot for release closure
    const capturedStateIn: object = { ...stateIn };

    const output: object = yield* pipe(
      step.release,
      Option.match({
        onNone: (): Effect.Effect<object, unknown, unknown> => step.acquire(stateIn),
        onSome: (release): Effect.Effect<object, unknown, Scope.Scope | unknown> =>
          Effect.acquireRelease(step.acquire(stateIn), (output: object, exit) =>
            release({ ...capturedStateIn, ...output }, Outcome.fromExit(exit))
          ),
      })
    );

    return { ...stateIn, ...output };
  }) as Effect.Effect<object, unknown, Scope.Scope | AppLogger>;

/**
 * Execute all steps in sequence, building the Effect chain incrementally.
 *
 * Pattern:
 * 1. Pair each step with its 1-based index using Arr.map
 * 2. Use Arr.reduce to fold steps into a single Effect chain
 * 3. Each step depends on previous via Effect.flatMap
 * 4. Scope manages resource cleanup (finalizers run in reverse order)
 */
const executePipeline = (
  steps: readonly StoredStep[],
  initialState: object
): Effect.Effect<void, unknown, Scope.Scope | AppLogger> =>
  Effect.gen(function* () {
    const totalSteps = steps.length;

    const indexedSteps: readonly IndexedStep[] = pipe(
      steps,
      Arr.map(
        (step, idx): IndexedStep => ({
          step,
          index: idx + 1, // 1-based for display
        })
      )
    );

    const chainedEffect = pipe(
      indexedSteps,
      Arr.reduce(
        Effect.succeed(initialState) as Effect.Effect<object, unknown, Scope.Scope | AppLogger>,
        (accEffect, { step, index }) =>
          Effect.flatMap(accEffect, (currentState) =>
            executeOneStep(step, currentState, index, totalSteps)
          )
      )
    );

    yield* chainedEffect;

    const logger = yield* AppLogger;
    logger.success("Setup completed successfully");
  });

/**
 * Create builder implementation using recursive construction.
 * No loops - uses immutable array operations from Effect Array module.
 *
 * The type erasure cast (step.acquire as unknown as StoredStep["acquire"]) is safe because:
 * 1. The builder enforces type safety at each `.then()` call
 * 2. At runtime, state objects are merged via spreading which preserves all properties
 * 3. The cast simply widens the type for storage in a homogeneous array
 */
const createBuilder = <S, Acc, E, R>(
  steps: readonly StoredStep[]
): PipelineBuilder<S, Acc, E, R> => ({
  stepCount: steps.length,

  andThen: <Output, E2, R2>(
    step: SetupStep<S & Acc, Output, E2, R2>
  ): PipelineBuilder<S, Acc & Output, E | E2, R | R2> =>
    createBuilder<S, Acc & Output, E | E2, R | R2>(
      Arr.append(steps, {
        message: step.message,
        acquire: step.acquire as unknown as StoredStep["acquire"],
        release: step.release as unknown as StoredStep["release"],
      } satisfies StoredStep)
    ),

  execute: (initialState: S): Effect.Effect<void, E, R | AppLogger> =>
    Effect.scoped(executePipeline(steps, initialState as object)) as Effect.Effect<
      void,
      E,
      R | AppLogger
    >,
});

/**
 * Create a new pipeline builder starting from initial state S.
 *
 * @example
 * ```typescript
 * const setup = pipeline<EmptyState>()
 *   .andThen(generateStep)
 *   .andThen(writeFilesStep)
 *   .andThen(enableServicesStep)
 *   .execute(emptyState);
 * ```
 */
export const pipeline = <S>(): PipelineBuilder<S, S, never, never> =>
  createBuilder<S, S, never, never>(Arr.empty());

// ============================================================================
// Config Validator Factory
// ============================================================================

export const createConfigValidator =
  <A, I = A>(
    schema: Schema.Schema<A, I, never>
  ): ((configPath: AbsolutePath) => Effect.Effect<void, ConfigError | SystemError>) =>
  (configPath): Effect.Effect<void, ConfigError | SystemError> =>
    Effect.map(loadServiceConfig(configPath, schema), () => undefined);

// ============================================================================
// Preview File Writing
// ============================================================================

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
