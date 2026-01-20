// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Actual Budget service implementation.
 * Simple single-container personal finance application.
 */

import { Effect, Option } from "effect";
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
import { ensureDirectories } from "../../system/directories";
import {
  type SetupStepAcquireResult,
  type SetupStepResource,
  createConfigValidator,
  createSingleContainerOps,
  executeSetupStepsScoped,
  reloadAndEnableServices,
  wrapBackupResult,
  writeGeneratedFiles,
} from "../helpers";
import type {
  BackupResult,
  GeneratedFiles,
  ServiceContext,
  ServiceDefinition,
  ServiceEffect,
} from "../types";
import { createGeneratedFiles } from "../types";
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
 */
const generate = (
  ctx: ServiceContext<ActualConfig>
): Effect.Effect<GeneratedFiles, ServiceError | GeneralError> =>
  Effect.sync(() => {
    const { config } = ctx;
    const files = createGeneratedFiles();

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
    };

    // Only add autoUpdate if defined
    const autoUpdate = config.container?.autoUpdate;
    if (Option.isSome(Option.fromNullable(autoUpdate))) {
      quadletConfig.autoUpdate = autoUpdate;
    }

    const containerQuadlet = generateContainerQuadlet(quadletConfig);

    files.quadlets.set(`${CONTAINER_NAME}.container`, containerQuadlet.content);

    return files;
  });

/**
 * Setup state for Actual - tracks data passed between steps.
 */
interface ActualSetupState {
  files?: GeneratedFiles;
}

/**
 * Full setup for Actual service.
 * Uses executeSetupStepsScoped for clean sequential execution with state threading.
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
        return ensureDirectories(dirs, { uid: ctx.user.uid, gid: ctx.user.gid });
      },
    },
    {
      message: "Writing quadlet files...",
      acquire: (
        ctx,
        state
      ): SetupStepAcquireResult<ActualSetupState, ServiceError | SystemError | GeneralError> =>
        state.files
          ? writeGeneratedFiles(state.files, ctx)
          : Effect.fail(
              new GeneralError({
                code: ErrorCode.GENERAL_ERROR as 1,
                message: "No files generated",
              })
            ),
    },
    {
      message: "Enabling service...",
      acquire: (
        ctx
      ): SetupStepAcquireResult<ActualSetupState, ServiceError | SystemError | GeneralError> =>
        reloadAndEnableServices(ctx, [CONTAINER_NAME], false),
    },
  ];

  return executeSetupStepsScoped(ctx, steps);
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
