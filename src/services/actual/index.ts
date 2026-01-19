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

import { DivbanError, ErrorCode } from "../../lib/errors";
import { fromUndefined, isSome } from "../../lib/option";
import { Err, Ok, type Result, mapResult } from "../../lib/result";
import type { AbsolutePath, ServiceName } from "../../lib/types";
import { createHttpHealthCheck, relabelVolumes } from "../../quadlet";
import { generateContainerQuadlet } from "../../quadlet/container";
import { ensureDirectories } from "../../system/directories";
import {
  type SetupStep,
  type SetupStepResult,
  createConfigValidator,
  createSingleContainerOps,
  executeSetupSteps,
  reloadAndEnableServices,
  wrapBackupResult,
  writeGeneratedFiles,
} from "../helpers";
import type {
  BackupResult,
  GeneratedFiles,
  Service,
  ServiceContext,
  ServiceDefinition,
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
): Promise<Result<GeneratedFiles, DivbanError>> => {
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
  if (isSome(fromUndefined(autoUpdate))) {
    quadletConfig.autoUpdate = autoUpdate;
  }

  const containerQuadlet = generateContainerQuadlet(quadletConfig);

  files.quadlets.set(`${CONTAINER_NAME}.container`, containerQuadlet.content);

  return Promise.resolve(Ok(files));
};

/**
 * Setup state for Actual - tracks data passed between steps.
 */
interface ActualSetupState {
  files?: GeneratedFiles;
}

/**
 * Full setup for Actual service.
 * Uses executeSetupSteps for clean sequential execution with state threading.
 */
const setup = (ctx: ServiceContext<ActualConfig>): Promise<Result<void, DivbanError>> => {
  const { config } = ctx;
  const dataDir = config.paths.dataDir;

  const steps: SetupStep<ActualConfig, ActualSetupState>[] = [
    {
      message: "Generating configuration files...",
      execute: async (ctx): SetupStepResult<ActualSetupState> =>
        mapResult(await generate(ctx), (files) => ({ files })),
    },
    {
      message: "Creating data directories...",
      execute: (ctx): SetupStepResult<ActualSetupState> => {
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
      execute: async (ctx, state): SetupStepResult<ActualSetupState> =>
        state.files
          ? writeGeneratedFiles(state.files, ctx)
          : Err(new DivbanError(ErrorCode.GENERAL_ERROR, "No files generated")),
    },
    {
      message: "Enabling service...",
      execute: (ctx): SetupStepResult<ActualSetupState> =>
        reloadAndEnableServices(ctx, [CONTAINER_NAME], false),
    },
  ];

  return executeSetupSteps(ctx, steps);
};

/**
 * Backup Actual data.
 */
const backup = (ctx: ServiceContext<ActualConfig>): Promise<Result<BackupResult, DivbanError>> => {
  const { config } = ctx;
  return wrapBackupResult(() =>
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
): Promise<Result<void, DivbanError>> => {
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
export const actualService: Service<ActualConfig> = {
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
