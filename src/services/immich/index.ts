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

import { DivbanError, ErrorCode } from "../../lib/errors";
import { configFilePath } from "../../lib/paths";
import { Err, Ok, type Result, asyncFlatMapResult, mapResult, sequence } from "../../lib/result";
import type { AbsolutePath, ServiceName } from "../../lib/types";
import {
  createEnvSecret,
  createHttpHealthCheck,
  createKeepIdNs,
  createMountedSecret,
  createPostgresHealthCheck,
  createRedisHealthCheck,
  getSecretMountPath,
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
import { ensureServiceSecrets, getPodmanSecretName } from "../../system/secrets";
import { journalctl } from "../../system/systemctl";
import {
  type SetupStep,
  type SetupStepResult,
  createConfigValidator,
  executeSetupSteps,
  reloadAndEnableServices,
  wrapBackupResult,
  writeGeneratedFiles,
} from "../helpers";
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
import { CONTAINERS, DEFAULT_IMAGES, INTERNAL_URLS, NETWORK_NAME } from "./constants";
import { getHardwareConfig, getMlImage, mergeDevices, mergeEnvironment } from "./hardware";
import { getLibraryEnvironment, librariesToVolumeMounts } from "./libraries";
import { type ImmichConfig, immichConfigSchema } from "./schema";
import { IMMICH_SECRETS, ImmichSecretNames } from "./secrets";

const SERVICE_NAME = "immich" as ServiceName;

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
const validate = createConfigValidator(immichConfigSchema);

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

  // Generate environment file (DB_PASSWORD is injected via podman secret)
  const envContent = generateEnvFile({
    header: "Immich Environment Configuration",
    groups: [
      {
        name: "Database Configuration",
        vars: {
          DB_HOSTNAME: CONTAINERS.postgres,
          DB_PORT: 5432,
          DB_DATABASE_NAME: config.database.database,
          DB_USERNAME: config.database.username,
        },
      },
      {
        name: "Redis Configuration",
        vars: {
          REDIS_HOSTNAME: CONTAINERS.redis,
          REDIS_PORT: 6379,
        },
      },
      {
        name: "Server Configuration",
        vars: {
          IMMICH_SERVER_URL: INTERNAL_URLS.server,
          IMMICH_MACHINE_LEARNING_URL:
            config.containers?.machineLearning?.enabled !== false ? INTERNAL_URLS.ml : undefined,
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
    name: CONTAINERS.redis,
    description: "Immich Redis cache",
    image: config.containers?.redis?.image ?? DEFAULT_IMAGES.redis,
    healthCheck: createRedisHealthCheck(),
    readOnlyRootfs: true,
    noNewPrivileges: true,
    service: { restart: "always" },
  });

  // PostgreSQL container
  const dbSecretName = getPodmanSecretName(SERVICE_NAME, ImmichSecretNames.DB_PASSWORD);
  containers.push({
    name: CONTAINERS.postgres,
    description: "Immich PostgreSQL database with pgvecto.rs",
    image: config.containers?.postgres?.image ?? DEFAULT_IMAGES.postgres,
    environment: {
      POSTGRES_PASSWORD_FILE: getSecretMountPath(dbSecretName),
      POSTGRES_USER: config.database.username,
      POSTGRES_DB: config.database.database,
      POSTGRES_INITDB_ARGS: "--data-checksums",
    },
    secrets: [createMountedSecret(dbSecretName)],
    volumes: [{ source: `${dataDir}/postgres`, target: "/var/lib/postgresql/data" }],
    healthCheck: createPostgresHealthCheck(config.database.username, config.database.database),
    shmSize: "256m",
    noNewPrivileges: true,
    service: { restart: "always" },
  });

  // Main server container
  const serverDevices = hardware.transcoding ? mergeDevices(hardware.transcoding) : [];
  const serverEnv = hardware.transcoding ? mergeEnvironment(hardware.transcoding) : {};
  const networkHost = config.network?.host ?? "127.0.0.1";
  const networkPort = config.network?.port ?? 2283;

  containers.push({
    name: CONTAINERS.server,
    description: "Immich server",
    image: config.containers?.server?.image ?? DEFAULT_IMAGES.server,
    requires: [CONTAINERS.redis, CONTAINERS.postgres],
    wants: config.containers?.machineLearning?.enabled !== false ? [CONTAINERS.ml] : undefined,
    ports: [{ hostIp: networkHost, host: networkPort, container: 2283 }],
    volumes: [
      { source: uploadDir, target: "/upload" },
      { source: profileDir, target: "/profile" },
      { source: thumbsDir, target: "/thumbs" },
      { source: encodedDir, target: "/encoded" },
      ...libraryMounts,
    ],
    environmentFiles: [`${ctx.paths.configDir}/immich.env`],
    environment: serverEnv,
    secrets: [createEnvSecret(dbSecretName, "DB_PASSWORD")],
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
    const mlBaseImage = config.containers?.machineLearning?.image ?? DEFAULT_IMAGES.ml;
    const mlImage = getMlImage(mlBaseImage, config.hardware?.ml ?? { type: "disabled" });
    const mlDevices = mergeDevices(hardware.ml);
    const mlEnv = mergeEnvironment(hardware.ml);

    containers.push({
      name: CONTAINERS.ml,
      description: "Immich Machine Learning",
      image: mlImage,
      volumes: [{ source: `${dataDir}/model-cache`, target: "/cache" }],
      environmentFiles: [`${ctx.paths.configDir}/immich.env`],
      environment: mlEnv,
      secrets: [createEnvSecret(dbSecretName, "DB_PASSWORD")],
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
    network: { name: NETWORK_NAME, internal: true },
    containers,
  });

  const stackFiles = generateStackQuadlets(stack, {
    envFilePath: configFilePath(ctx.paths.configDir, "immich.env"),
    userNs: createKeepIdNs(),
    selinuxEnforcing: ctx.system.selinuxEnforcing,
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
 * Setup state for Immich - tracks data passed between steps.
 */
interface ImmichSetupState {
  files?: GeneratedFiles;
}

/**
 * Full setup for Immich service.
 * Uses executeSetupSteps for clean sequential execution with state threading.
 */
const setup = (ctx: ServiceContext<ImmichConfig>): Promise<Result<void, DivbanError>> => {
  const { config } = ctx;
  const dataDir = config.paths.dataDir;

  const steps: SetupStep<ImmichConfig, ImmichSetupState>[] = [
    {
      message: "Generating secrets...",
      execute: async (ctx): SetupStepResult<ImmichSetupState> => {
        const homeDir = ctx.paths.configDir.replace("/.config/divban", "") as AbsolutePath;
        return mapResult(
          await ensureServiceSecrets(
            SERVICE_NAME,
            IMMICH_SECRETS,
            homeDir,
            ctx.user.name,
            ctx.user.uid,
            ctx.user.gid
          ),
          () => undefined
        );
      },
    },
    {
      message: "Generating configuration files...",
      execute: async (ctx): SetupStepResult<ImmichSetupState> =>
        mapResult(await generate(ctx), (files) => ({ files })),
    },
    {
      message: "Creating data directories...",
      execute: async (ctx): SetupStepResult<ImmichSetupState> => {
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
        const dirOps = dirs.map(
          (dir): (() => Promise<Result<void, DivbanError>>) =>
            (): Promise<Result<void, DivbanError>> =>
              ensureDirectory(dir as AbsolutePath, owner)
        );
        return mapResult(await sequence(dirOps), () => undefined);
      },
    },
    {
      message: "Writing configuration files...",
      execute: (ctx, state): SetupStepResult<ImmichSetupState> =>
        state.files
          ? writeGeneratedFiles(state.files, ctx)
          : Promise.resolve(Err(new DivbanError(ErrorCode.GENERAL_ERROR, "No files generated"))),
    },
    {
      message: "Reloading daemon and enabling services...",
      execute: (ctx): SetupStepResult<ImmichSetupState> =>
        reloadAndEnableServices(
          ctx,
          [CONTAINERS.redis, CONTAINERS.postgres, CONTAINERS.server, CONTAINERS.ml],
          false
        ),
    },
  ];

  return executeSetupSteps(ctx, steps);
};

/**
 * Start Immich service.
 */
const start = (ctx: ServiceContext<ImmichConfig>): Promise<Result<void, DivbanError>> => {
  const { config } = ctx;
  const containers: StackContainer[] = [
    { name: CONTAINERS.redis, image: "", requires: [] },
    { name: CONTAINERS.postgres, image: "", requires: [CONTAINERS.redis] },
    { name: CONTAINERS.server, image: "", requires: [CONTAINERS.redis, CONTAINERS.postgres] },
  ];

  if (config.containers?.machineLearning?.enabled !== false) {
    containers.push({ name: CONTAINERS.ml, image: "", requires: [] });
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
    { name: CONTAINERS.server, image: "", requires: [CONTAINERS.redis, CONTAINERS.postgres] },
    { name: CONTAINERS.postgres, image: "", requires: [CONTAINERS.redis] },
    { name: CONTAINERS.redis, image: "" },
  ];

  if (config.containers?.machineLearning?.enabled !== false) {
    containers.unshift({ name: CONTAINERS.ml, image: "" });
  }

  const stack = createStack({ name: "immich", containers });
  return stopStack(stack, { user: ctx.user.name, uid: ctx.user.uid, logger: ctx.logger });
};

/**
 * Restart Immich service.
 */
const restart = async (ctx: ServiceContext<ImmichConfig>): Promise<Result<void, DivbanError>> => {
  ctx.logger.info("Restarting Immich...");
  return asyncFlatMapResult(await stop(ctx), () => start(ctx));
};

/**
 * Get Immich status.
 */
const status = async (
  ctx: ServiceContext<ImmichConfig>
): Promise<Result<ServiceStatus, DivbanError>> => {
  const { config } = ctx;
  const containers: StackContainer[] = [
    { name: CONTAINERS.redis, image: "" },
    { name: CONTAINERS.postgres, image: "" },
    { name: CONTAINERS.server, image: "" },
  ];

  if (config.containers?.machineLearning?.enabled !== false) {
    containers.push({ name: CONTAINERS.ml, image: "" });
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
  const unit = options.container ? `${options.container}.service` : `${CONTAINERS.server}.service`;

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
