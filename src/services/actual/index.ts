// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Actual Budget service implementation.
 * Uses Effect's context system - dependencies accessed via yield*.
 */

import { Effect, Exit } from "effect";
import {
  type BackupError,
  ErrorCode,
  GeneralError,
  type ServiceError,
  type SystemError,
} from "../../lib/errors";
import type { AbsolutePath, ServiceName } from "../../lib/types";
import { createHttpHealthCheck, relabelVolumes } from "../../quadlet";
import { generateContainerQuadlet } from "../../quadlet/container";
import { ensureDirectoriesTracked, removeDirectoriesReverse } from "../../system/directories";
import { AppLogger, type ServicePaths, ServiceUser, SystemCapabilities } from "../context";
import {
  type FilesWriteResult,
  type ServicesEnableResult,
  type SetupStepResource,
  createConfigValidator,
  createSingleContainerOps,
  executeSetupStepsScoped,
  releaseFileWrites,
  reloadAndEnableServicesTracked,
  rollbackServiceChanges,
  wrapBackupResult,
  writeGeneratedFilesTracked,
} from "../helpers";
import type { BackupResult, GeneratedFiles, ServiceDefinition, ServiceEffect } from "../types";
import { backupActual, restoreActual } from "./commands/backup";
import { ActualConfigTag } from "./config";
import { type ActualConfig, actualConfigSchema } from "./schema";

const SERVICE_NAME = "actual" as ServiceName;
const CONTAINER_NAME = "actual";

/**
 * Actual service definition.
 */
const definition: ServiceDefinition = {
  name: SERVICE_NAME,
  description: "Self-hosted personal finance management",
  version: "0.1.0",
  configSchema: actualConfigSchema,
  capabilities: {
    multiContainer: false,
    hasReload: false,
    hasBackup: true,
    hasRestore: true,
    hardwareAcceleration: false,
  },
};

/**
 * Single-container operations for Actual.
 * Uses Effect context - no ctx parameter needed.
 */
const ops = createSingleContainerOps({
  serviceName: CONTAINER_NAME,
  displayName: "Actual",
});

/**
 * Validate Actual configuration file.
 */
const validate = createConfigValidator(actualConfigSchema);

/**
 * Generate all files for Actual service.
 * Dependencies accessed via Effect context.
 */
const generate = (): Effect.Effect<
  GeneratedFiles,
  ServiceError | GeneralError,
  ActualConfigTag | SystemCapabilities
> =>
  Effect.gen(function* () {
    const config = yield* ActualConfigTag;
    const system = yield* SystemCapabilities;

    // Build container quadlet
    const port = config.network?.port ?? 5006;
    const host = config.network?.host ?? "127.0.0.1";

    const quadletConfig: Parameters<typeof generateContainerQuadlet>[0] = {
      name: CONTAINER_NAME,
      containerName: CONTAINER_NAME,
      description: "Actual Budget Server",
      image: config.container?.image ?? "docker.io/actualbudget/actual-server:latest",

      // Network - bind to localhost by default for security
      ports: [
        {
          hostIp: host,
          host: port,
          container: 5006,
        },
      ],

      // Volumes
      volumes: relabelVolumes(
        [
          {
            source: config.paths.dataDir,
            target: "/data",
          },
        ],
        system.selinuxEnforcing
      ),

      // User namespace
      userNs: {
        mode: "keep-id",
      },

      // Health check
      healthCheck: createHttpHealthCheck("http://localhost:5006/", {
        interval: "30s",
        startPeriod: "10s",
      }),

      // Security
      readOnlyRootfs: false, // Actual needs write access to various paths
      noNewPrivileges: true,

      // Service options
      service: {
        restart: "always",
      },

      // Auto-update (only if configured)
      ...(config.container?.autoUpdate !== undefined && {
        autoUpdate: config.container.autoUpdate,
      }),
    };

    const containerQuadlet = generateContainerQuadlet(quadletConfig);

    // Return GeneratedFiles with pre-built Maps (no mutations)
    return {
      quadlets: new Map([[`${CONTAINER_NAME}.container`, containerQuadlet.content]]),
      networks: new Map(),
      volumes: new Map(),
      environment: new Map(),
      other: new Map(),
    };
  });

/**
 * Setup state for Actual - tracks data passed between steps.
 */
interface ActualSetupState {
  files?: GeneratedFiles;
  createdDirs?: readonly AbsolutePath[];
  fileResults?: FilesWriteResult;
  serviceResults?: ServicesEnableResult;
}

/**
 * Setup step dependencies - union of all step requirements.
 */
type ActualSetupDeps =
  | ActualConfigTag
  | ServicePaths
  | ServiceUser
  | SystemCapabilities
  | AppLogger;

/**
 * Full setup for Actual service.
 * Dependencies accessed via Effect context.
 */
const setup = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  ActualSetupDeps
> => {
  // Steps access dependencies via Effect context
  const steps: SetupStepResource<
    ActualSetupState,
    ServiceError | SystemError | GeneralError,
    ActualSetupDeps
  >[] = [
    {
      message: "Generating configuration files...",
      acquire: (
        _state
      ): Effect.Effect<
        { files: GeneratedFiles },
        ServiceError | GeneralError,
        ActualConfigTag | SystemCapabilities
      > => Effect.map(generate(), (files) => ({ files })),
      // No release - pure in-memory computation
    },
    {
      message: "Creating data directories...",
      acquire: (
        _state
      ): Effect.Effect<
        { createdDirs: readonly AbsolutePath[] },
        SystemError | GeneralError,
        ActualConfigTag | ServiceUser
      > =>
        Effect.gen(function* () {
          const config = yield* ActualConfigTag;
          const user = yield* ServiceUser;

          const dataDir = config.paths.dataDir;
          const dirs = [
            dataDir,
            `${dataDir}/server-files`,
            `${dataDir}/user-files`,
            `${dataDir}/backups`,
          ] as AbsolutePath[];

          const { createdPaths } = yield* ensureDirectoriesTracked(dirs, {
            uid: user.uid,
            gid: user.gid,
          });
          return { createdDirs: createdPaths };
        }),
      release: (
        state: ActualSetupState,
        exit: Exit.Exit<unknown, unknown>
      ): Effect.Effect<void, never, never> =>
        Exit.isFailure(exit) && state.createdDirs
          ? removeDirectoriesReverse(state.createdDirs)
          : Effect.void,
    },
    {
      message: "Writing quadlet files...",
      acquire: (
        state
      ): Effect.Effect<
        { fileResults: FilesWriteResult },
        SystemError | GeneralError,
        ServicePaths | ServiceUser
      > =>
        state.files
          ? Effect.map(writeGeneratedFilesTracked(state.files), (fileResults) => ({
              fileResults,
            }))
          : Effect.fail(
              new GeneralError({
                code: ErrorCode.GENERAL_ERROR as 1,
                message: "No files generated",
              })
            ),
      release: (
        state: ActualSetupState,
        exit: Exit.Exit<unknown, unknown>
      ): Effect.Effect<void, never, ServicePaths | ServiceUser | AppLogger> =>
        releaseFileWrites(state.fileResults, Exit.isFailure(exit)),
    },
    {
      message: "Enabling service...",
      acquire: (
        _state
      ): Effect.Effect<
        { serviceResults: ServicesEnableResult },
        ServiceError | SystemError | GeneralError,
        ServiceUser
      > =>
        Effect.map(reloadAndEnableServicesTracked([CONTAINER_NAME], false), (serviceResults) => ({
          serviceResults,
        })),
      release: (
        state: ActualSetupState,
        exit: Exit.Exit<unknown, unknown>
      ): Effect.Effect<void, never, ServiceUser> =>
        Exit.isFailure(exit) && state.serviceResults
          ? rollbackServiceChanges(state.serviceResults)
          : Effect.void,
    },
  ];

  return executeSetupStepsScoped(steps, {});
};

/**
 * Backup Actual data.
 * Dependencies accessed via Effect context.
 */
const backup = (): Effect.Effect<
  BackupResult,
  BackupError | SystemError | GeneralError,
  ActualConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const config = yield* ActualConfigTag;
    const user = yield* ServiceUser;
    const logger = yield* AppLogger;

    return yield* wrapBackupResult(
      backupActual({
        dataDir: config.paths.dataDir as AbsolutePath,
        user: user.name,
        uid: user.uid,
        logger,
      })
    );
  });

/**
 * Restore Actual data from backup.
 * Dependencies accessed via Effect context.
 */
const restore = (
  backupPath: AbsolutePath
): Effect.Effect<
  void,
  BackupError | SystemError | GeneralError,
  ActualConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const config = yield* ActualConfigTag;
    const user = yield* ServiceUser;
    const logger = yield* AppLogger;

    yield* restoreActual(
      backupPath,
      config.paths.dataDir as AbsolutePath,
      user.name,
      user.uid,
      logger
    );
  });

/**
 * Actual service implementation.
 */
export const actualService: ServiceEffect<ActualConfig, ActualConfigTag, typeof ActualConfigTag> = {
  definition,
  configTag: ActualConfigTag,
  validate,
  generate,
  setup,
  start: ops.start,
  stop: ops.stop,
  restart: ops.restart,
  status: ops.status,
  logs: ops.logs,
  backup,
  restore,
};
