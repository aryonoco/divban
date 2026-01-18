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

import { loadServiceConfig } from "../../config/loader";
import type { DivbanError } from "../../lib/errors";
import { Ok, type Result } from "../../lib/result";
import type { AbsolutePath, ServiceName } from "../../lib/types";
import { createHttpHealthCheck } from "../../quadlet";
import { generateContainerQuadlet } from "../../quadlet/container";
import { ensureDirectory } from "../../system/fs";
import {
  createSingleContainerOps,
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
const validate = async (configPath: AbsolutePath): Promise<Result<void, DivbanError>> => {
  const result = await loadServiceConfig(configPath, actualConfigSchema);
  if (!result.ok) {
    return result;
  }
  return Ok(undefined);
};

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
    volumes: [
      {
        source: config.paths.dataDir,
        target: "/data",
      },
    ],

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
  if (autoUpdate !== undefined) {
    quadletConfig.autoUpdate = autoUpdate;
  }

  const containerQuadlet = generateContainerQuadlet(quadletConfig);

  files.quadlets.set(`${CONTAINER_NAME}.container`, containerQuadlet.content);

  return Promise.resolve(Ok(files));
};

/**
 * Full setup for Actual service.
 */
const setup = async (ctx: ServiceContext<ActualConfig>): Promise<Result<void, DivbanError>> => {
  const { logger, config } = ctx;

  // 1. Generate files
  logger.step(1, 4, "Generating configuration files...");
  const filesResult = await generate(ctx);
  if (!filesResult.ok) {
    return filesResult;
  }

  // 2. Create data directories
  logger.step(2, 4, "Creating data directories...");
  const dataDir = config.paths.dataDir;
  const dirs = [dataDir, `${dataDir}/server-files`, `${dataDir}/user-files`, `${dataDir}/backups`];
  for (const dir of dirs) {
    const result = await ensureDirectory(dir as AbsolutePath);
    if (!result.ok) {
      return result;
    }
  }

  // 3. Write quadlet files
  logger.step(3, 4, "Writing quadlet files...");
  const writeResult = await writeGeneratedFiles(filesResult.value, ctx);
  if (!writeResult.ok) {
    return writeResult;
  }

  // 4. Enable service (don't start - user may want to configure first)
  logger.step(4, 4, "Enabling service...");
  const enableResult = await reloadAndEnableServices(ctx, [CONTAINER_NAME], false);
  if (!enableResult.ok) {
    return enableResult;
  }

  logger.success("Actual setup completed successfully");
  return Ok(undefined);
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
