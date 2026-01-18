// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Immich photo management service implementation.
 * Multi-container service with hardware acceleration support.
 */

import { loadServiceConfig } from "../../config/loader";
import type { DivbanError } from "../../lib/errors";
import { configFilePath } from "../../lib/paths";
import { Ok, type Result } from "../../lib/result";
import type { AbsolutePath, ServiceName } from "../../lib/types";
import {
  createHttpHealthCheck,
  createKeepIdNs,
  createPostgresHealthCheck,
  createRedisHealthCheck,
} from "../../quadlet";
import {
  createStack,
  generateEnvFile,
  generateStackQuadlets,
  getStackStatus,
  startStack,
  stopStack,
} from "../../stack";
import type { StackContainer } from "../../stack/types";
import { ensureDirectory } from "../../system/directories";
import { daemonReload, enableService, journalctl } from "../../system/systemctl";
import { wrapBackupResult, writeGeneratedFiles } from "../helpers";
import type {
  BackupResult,
  GeneratedFiles,
  LogOptions,
  Service,
  ServiceContext,
  ServiceDefinition,
  ServiceStatus,
} from "../types";
import { createGeneratedFiles } from "../types";
import { backupDatabase } from "./commands/backup";
import { restoreDatabase } from "./commands/restore";
import { getHardwareConfig, getMlImage, mergeDevices, mergeEnvironment } from "./hardware";
import { getLibraryEnvironment, librariesToVolumeMounts } from "./libraries";
import { type ImmichConfig, immichConfigSchema } from "./schema";

const SERVICE_NAME = "immich" as ServiceName;
const DEFAULT_ML_IMAGE = "ghcr.io/immich-app/immich-machine-learning:release";

/**
 * Immich service definition.
 */
const definition: ServiceDefinition = {
  name: SERVICE_NAME,
  description: "Self-hosted photo and video management",
  version: "0.1.0",
  configSchema: immichConfigSchema,
  capabilities: {
    multiContainer: true,
    hasReload: false,
    hasBackup: true,
    hasRestore: true,
    hardwareAcceleration: true,
  },
};

/**
 * Validate Immich configuration file.
 */
const validate = async (configPath: AbsolutePath): Promise<Result<void, DivbanError>> => {
  const result = await loadServiceConfig(configPath, immichConfigSchema);
  if (!result.ok) {
    return result;
  }
  return Ok(undefined);
};

/**
 * Generate all files for Immich service.
 */
const generate = (
  ctx: ServiceContext<ImmichConfig>
): Promise<Result<GeneratedFiles, DivbanError>> => {
  const { config } = ctx;
  const files = createGeneratedFiles();

  // Get hardware configuration
  const hardware = getHardwareConfig(
    config.hardware?.transcoding ?? { type: "disabled" },
    config.hardware?.ml ?? { type: "disabled" }
  );

  // Get external library mounts
  const libraryMounts = librariesToVolumeMounts(config.externalLibraries);
  const libraryEnv = getLibraryEnvironment(config.externalLibraries);

  // Paths
  const dataDir = config.paths.dataDir;
  const uploadDir = config.paths.uploadDir ?? `${dataDir}/upload`;
  const profileDir = config.paths.profileDir ?? `${dataDir}/profile`;
  const thumbsDir = config.paths.thumbsDir ?? `${dataDir}/thumbs`;
  const encodedDir = config.paths.encodedDir ?? `${dataDir}/encoded`;

  // Generate environment file
  const envContent = generateEnvFile({
    header: "Immich Environment Configuration",
    groups: [
      {
        name: "Database Configuration",
        vars: {
          DB_HOSTNAME: "immich-postgres",
          DB_PORT: 5432,
          DB_DATABASE_NAME: config.database.database,
          DB_USERNAME: config.database.username,
          DB_PASSWORD: config.database.password,
        },
      },
      {
        name: "Redis Configuration",
        vars: {
          REDIS_HOSTNAME: "immich-redis",
          REDIS_PORT: 6379,
        },
      },
      {
        name: "Server Configuration",
        vars: {
          IMMICH_SERVER_URL: "http://immich-server:2283",
          IMMICH_MACHINE_LEARNING_URL:
            config.containers?.machineLearning?.enabled !== false
              ? "http://immich-machine-learning:3003"
              : undefined,
          LOG_LEVEL: config.logLevel,
          IMMICH_WEB_URL: config.publicUrl,
        },
      },
      {
        name: "Upload Paths",
        vars: {
          UPLOAD_LOCATION: "/upload",
        },
      },
      {
        name: "External Libraries",
        vars: libraryEnv,
      },
    ],
  });
  files.environment.set("immich.env", envContent);

  // Build containers
  const containers: StackContainer[] = [];

  // Redis container
  containers.push({
    name: "immich-redis",
    description: "Immich Redis cache",
    image: config.containers?.redis?.image ?? "docker.io/library/redis:7-alpine",
    healthCheck: createRedisHealthCheck(),
    readOnlyRootfs: true,
    noNewPrivileges: true,
    service: { restart: "always" },
  });

  // PostgreSQL container
  containers.push({
    name: "immich-postgres",
    description: "Immich PostgreSQL database with pgvecto.rs",
    image: config.containers?.postgres?.image ?? "docker.io/tensorchord/pgvecto-rs:pg16-v0.2.0",
    environment: {
      POSTGRES_PASSWORD: config.database.password,
      POSTGRES_USER: config.database.username,
      POSTGRES_DB: config.database.database,
      POSTGRES_INITDB_ARGS: "--data-checksums",
    },
    volumes: [{ source: `${dataDir}/postgres`, target: "/var/lib/postgresql/data" }],
    healthCheck: createPostgresHealthCheck(config.database.username, config.database.database),
    shmSize: "256m",
    noNewPrivileges: true,
    service: { restart: "always" },
  });

  // Main server container
  const serverDevices = hardware.transcoding ? mergeDevices(hardware.transcoding) : [];
  const serverEnv = hardware.transcoding ? mergeEnvironment(hardware.transcoding) : {};

  containers.push({
    name: "immich-server",
    description: "Immich server",
    image: config.containers?.server?.image ?? "ghcr.io/immich-app/immich-server:release",
    requires: ["immich-redis", "immich-postgres"],
    wants:
      config.containers?.machineLearning?.enabled !== false
        ? ["immich-machine-learning"]
        : undefined,
    // Bind to localhost only - access via reverse proxy
    ports: [{ hostIp: "127.0.0.1", host: 2283, container: 2283 }],
    volumes: [
      { source: uploadDir, target: "/upload" },
      { source: profileDir, target: "/profile" },
      { source: thumbsDir, target: "/thumbs" },
      { source: encodedDir, target: "/encoded" },
      ...libraryMounts,
    ],
    environmentFiles: [`${ctx.paths.configDir}/immich.env`],
    environment: serverEnv,
    devices: serverDevices.length > 0 ? serverDevices : undefined,
    userNs: createKeepIdNs(),
    healthCheck: createHttpHealthCheck("http://localhost:2283/api/server/ping", {
      interval: "30s",
      startPeriod: "30s",
    }),
    noNewPrivileges: true,
    service: { restart: "always" },
  });

  // Machine Learning container (optional)
  if (config.containers?.machineLearning?.enabled !== false) {
    const mlBaseImage = config.containers?.machineLearning?.image ?? DEFAULT_ML_IMAGE;
    const mlImage = getMlImage(mlBaseImage, config.hardware?.ml ?? { type: "disabled" });
    const mlDevices = mergeDevices(hardware.ml);
    const mlEnv = mergeEnvironment(hardware.ml);

    containers.push({
      name: "immich-machine-learning",
      description: "Immich Machine Learning",
      image: mlImage,
      volumes: [{ source: `${dataDir}/model-cache`, target: "/cache" }],
      environmentFiles: [`${ctx.paths.configDir}/immich.env`],
      environment: mlEnv,
      devices: mlDevices.length > 0 ? mlDevices : undefined,
      healthCheck: createHttpHealthCheck("http://localhost:3003/ping", {
        interval: "30s",
        startPeriod: "60s",
      }),
      noNewPrivileges: true,
      service: { restart: "always" },
    });
  }

  // Create stack and generate quadlets
  const stack = createStack({
    name: "immich",
    network: { name: "immich-net", internal: true },
    containers,
  });

  const stackFiles = generateStackQuadlets(stack, {
    envFilePath: configFilePath(ctx.paths.configDir, "immich.env"),
    userNs: createKeepIdNs(),
  });

  // Merge into files
  for (const [k, v] of stackFiles.containers) {
    files.quadlets.set(k, v);
  }
  for (const [k, v] of stackFiles.networks) {
    files.networks.set(k, v);
  }
  for (const [k, v] of stackFiles.volumes) {
    files.volumes.set(k, v);
  }

  return Promise.resolve(Ok(files));
};

/**
 * Full setup for Immich service.
 */
const setup = async (ctx: ServiceContext<ImmichConfig>): Promise<Result<void, DivbanError>> => {
  const { logger, config } = ctx;

  // 1. Generate files
  logger.step(1, 5, "Generating configuration files...");
  const filesResult = await generate(ctx);
  if (!filesResult.ok) {
    return filesResult;
  }

  // 2. Create data directories
  logger.step(2, 5, "Creating data directories...");
  const dataDir = config.paths.dataDir;
  const owner = { uid: ctx.user.uid, gid: ctx.user.gid };
  const dirs = [
    `${dataDir}/upload`,
    `${dataDir}/profile`,
    `${dataDir}/thumbs`,
    `${dataDir}/encoded`,
    `${dataDir}/postgres`,
    `${dataDir}/model-cache`,
    `${dataDir}/backups`,
  ];
  for (const dir of dirs) {
    const result = await ensureDirectory(dir as AbsolutePath, owner);
    if (!result.ok) {
      return result;
    }
  }

  // 3. Write files
  logger.step(3, 5, "Writing configuration files...");
  const writeResult = await writeGeneratedFiles(filesResult.value, ctx);
  if (!writeResult.ok) {
    return writeResult;
  }

  // 4. Reload systemd daemon
  logger.step(4, 5, "Reloading systemd daemon...");
  const reloadResult = await daemonReload({ user: ctx.user.name, uid: ctx.user.uid });
  if (!reloadResult.ok) {
    return reloadResult;
  }

  // 5. Enable services
  logger.step(5, 5, "Enabling services...");
  for (const unit of [
    "immich-redis",
    "immich-postgres",
    "immich-server",
    "immich-machine-learning",
  ]) {
    await enableService(`${unit}.service`, { user: ctx.user.name, uid: ctx.user.uid });
  }

  logger.success("Immich setup completed successfully");
  return Ok(undefined);
};

/**
 * Start Immich service.
 */
const start = (ctx: ServiceContext<ImmichConfig>): Promise<Result<void, DivbanError>> => {
  const { config } = ctx;
  const containers: StackContainer[] = [
    { name: "immich-redis", image: "", requires: [] },
    { name: "immich-postgres", image: "", requires: ["immich-redis"] },
    { name: "immich-server", image: "", requires: ["immich-redis", "immich-postgres"] },
  ];

  if (config.containers?.machineLearning?.enabled !== false) {
    containers.push({ name: "immich-machine-learning", image: "", requires: [] });
  }

  const stack = createStack({ name: "immich", containers });
  return startStack(stack, { user: ctx.user.name, uid: ctx.user.uid, logger: ctx.logger });
};

/**
 * Stop Immich service.
 */
const stop = (ctx: ServiceContext<ImmichConfig>): Promise<Result<void, DivbanError>> => {
  const { config } = ctx;
  const containers: StackContainer[] = [
    { name: "immich-server", image: "", requires: ["immich-redis", "immich-postgres"] },
    { name: "immich-postgres", image: "", requires: ["immich-redis"] },
    { name: "immich-redis", image: "" },
  ];

  if (config.containers?.machineLearning?.enabled !== false) {
    containers.unshift({ name: "immich-machine-learning", image: "" });
  }

  const stack = createStack({ name: "immich", containers });
  return stopStack(stack, { user: ctx.user.name, uid: ctx.user.uid, logger: ctx.logger });
};

/**
 * Restart Immich service.
 */
const restart = async (ctx: ServiceContext<ImmichConfig>): Promise<Result<void, DivbanError>> => {
  ctx.logger.info("Restarting Immich...");
  const stopResult = await stop(ctx);
  if (!stopResult.ok) {
    return stopResult;
  }
  return start(ctx);
};

/**
 * Get Immich status.
 */
const status = async (
  ctx: ServiceContext<ImmichConfig>
): Promise<Result<ServiceStatus, DivbanError>> => {
  const { config } = ctx;
  const containers: StackContainer[] = [
    { name: "immich-redis", image: "" },
    { name: "immich-postgres", image: "" },
    { name: "immich-server", image: "" },
  ];

  if (config.containers?.machineLearning?.enabled !== false) {
    containers.push({ name: "immich-machine-learning", image: "" });
  }

  const stack = createStack({ name: "immich", containers });
  const statusResult = await getStackStatus(stack, {
    user: ctx.user.name,
    uid: ctx.user.uid,
    logger: ctx.logger,
  });

  if (!statusResult.ok) {
    return statusResult;
  }

  const containerStatuses = statusResult.value;
  const allRunning = containerStatuses.every((c) => c.running);

  return Ok({
    running: allRunning,
    containers: containerStatuses.map((c) => ({
      name: c.name,
      status: c.running ? { status: "running" as const } : { status: "stopped" as const },
    })),
  });
};

/**
 * View Immich logs.
 */
const logs = (
  ctx: ServiceContext<ImmichConfig>,
  options: LogOptions
): Promise<Result<void, DivbanError>> => {
  const unit = options.container ? `${options.container}.service` : "immich-server.service";

  return journalctl(unit, {
    user: ctx.user.name,
    uid: ctx.user.uid,
    follow: options.follow,
    lines: options.lines,
  });
};

/**
 * Backup Immich database.
 */
const backup = (ctx: ServiceContext<ImmichConfig>): Promise<Result<BackupResult, DivbanError>> => {
  const { config } = ctx;
  return wrapBackupResult(() =>
    backupDatabase({
      dataDir: config.paths.dataDir as AbsolutePath,
      user: ctx.user.name,
      uid: ctx.user.uid,
      logger: ctx.logger,
      database: config.database.database,
      dbUser: config.database.username,
    })
  );
};

/**
 * Restore Immich database.
 */
const restore = (
  ctx: ServiceContext<ImmichConfig>,
  backupPath: AbsolutePath
): Promise<Result<void, DivbanError>> => {
  const { config } = ctx;

  return restoreDatabase({
    backupPath,
    user: ctx.user.name,
    uid: ctx.user.uid,
    logger: ctx.logger,
    database: config.database.database,
    dbUser: config.database.username,
  });
};

/**
 * Immich service implementation.
 */
export const immichService: Service<ImmichConfig> = {
  definition,
  validate,
  generate,
  setup,
  start,
  stop,
  restart,
  status,
  logs,
  backup,
  restore,
};
