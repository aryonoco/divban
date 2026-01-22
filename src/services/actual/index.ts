// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Actual Budget service implementation.
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
import {
  type FilesWriteResult,
  type ServicesEnableResult,
  type SetupStepAcquireResult,
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
import type {
  BackupResult,
  GeneratedFiles,
  ServiceContext,
  ServiceDefinition,
  ServiceEffect,
} from "../types";
import { backupActual, restoreActual } from "./commands/backup";
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
 */
const ops = createSingleContainerOps<ActualConfig>({
  serviceName: CONTAINER_NAME,
  displayName: "Actual",
});

/**
 * Validate Actual configuration file.
 */
const validate = createConfigValidator(actualConfigSchema);

/**
 * Generate all files for Actual service.
 * Returns immutable GeneratedFiles with pre-built Maps.
 */
const generate = (
  ctx: ServiceContext<ActualConfig>
): Effect.Effect<GeneratedFiles, ServiceError | GeneralError> =>
  Effect.sync(() => {
    const { config } = ctx;

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
        ctx.system.selinuxEnforcing
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
 * Full setup for Actual service.
 */
const setup = (
  ctx: ServiceContext<ActualConfig>
): Effect.Effect<void, ServiceError | SystemError | GeneralError> => {
  const { config } = ctx;
  const dataDir = config.paths.dataDir;

  const steps: SetupStepResource<ActualConfig, ActualSetupState>[] = [
    {
      message: "Generating configuration files...",
      acquire: (ctx): SetupStepAcquireResult<ActualSetupState, ServiceError | GeneralError> =>
        Effect.map(generate(ctx), (files) => ({ files })),
      // No release - pure in-memory computation
    },
    {
      message: "Creating data directories...",
      acquire: (
        ctx
      ): SetupStepAcquireResult<ActualSetupState, ServiceError | SystemError | GeneralError> => {
        const dirs = [
          dataDir,
          `${dataDir}/server-files`,
          `${dataDir}/user-files`,
          `${dataDir}/backups`,
        ] as AbsolutePath[];
        return Effect.map(
          ensureDirectoriesTracked(dirs, { uid: ctx.user.uid, gid: ctx.user.gid }),
          ({ createdPaths }) => ({ createdDirs: createdPaths })
        );
      },
      release: (_ctx, state, exit): Effect.Effect<void, never> =>
        Exit.isFailure(exit) && state.createdDirs
          ? removeDirectoriesReverse(state.createdDirs)
          : Effect.void,
    },
    {
      message: "Writing quadlet files...",
      acquire: (
        ctx,
        state
      ): SetupStepAcquireResult<ActualSetupState, ServiceError | SystemError | GeneralError> =>
        state.files
          ? Effect.map(writeGeneratedFilesTracked(state.files, ctx), (fileResults) => ({
              fileResults,
            }))
          : Effect.fail(
              new GeneralError({
                code: ErrorCode.GENERAL_ERROR as 1,
                message: "No files generated",
              })
            ),
      release: (_ctx, state, exit): Effect.Effect<void, never> =>
        releaseFileWrites(state.fileResults, Exit.isFailure(exit)),
    },
    {
      message: "Enabling service...",
      acquire: (
        ctx
      ): SetupStepAcquireResult<ActualSetupState, ServiceError | SystemError | GeneralError> =>
        Effect.map(
          reloadAndEnableServicesTracked(ctx, [CONTAINER_NAME], false),
          (serviceResults) => ({
            serviceResults,
          })
        ),
      release: (ctx, state, exit): Effect.Effect<void, never> =>
        Exit.isFailure(exit) && state.serviceResults
          ? rollbackServiceChanges(ctx, state.serviceResults)
          : Effect.void,
    },
  ];

  return executeSetupStepsScoped<
    ActualConfig,
    ActualSetupState,
    ServiceError | SystemError | GeneralError
  >(ctx, steps, {});
};

/**
 * Backup Actual data.
 */
const backup = (
  ctx: ServiceContext<ActualConfig>
): Effect.Effect<BackupResult, BackupError | SystemError | GeneralError> => {
  const { config } = ctx;
  return wrapBackupResult(
    backupActual({
      dataDir: config.paths.dataDir as AbsolutePath,
      user: ctx.user.name,
      uid: ctx.user.uid,
      logger: ctx.logger,
    })
  );
};

/**
 * Restore Actual data from backup.
 */
const restore = (
  ctx: ServiceContext<ActualConfig>,
  backupPath: AbsolutePath
): Effect.Effect<void, BackupError | SystemError | GeneralError> => {
  const { config } = ctx;

  return restoreActual(
    backupPath,
    config.paths.dataDir as AbsolutePath,
    ctx.user.name,
    ctx.user.uid,
    ctx.logger
  );
};

/**
 * Actual service implementation.
 */
export const actualService: ServiceEffect<ActualConfig> = {
  definition,
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
