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

import { Effect, Exit } from "effect";
import {
  type BackupError,
  type ContainerError,
  ErrorCode,
  GeneralError,
  type ServiceError,
  type SystemError,
} from "../../lib/errors";
import { configFilePath } from "../../lib/paths";
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
import { createStack, generateEnvFile, generateStackQuadlets } from "../../stack";
import { getStackStatus, startStack, stopStack } from "../../stack/orchestrator";
import type { StackContainer } from "../../stack/types";
import { ensureDirectoriesTracked, removeDirectoriesReverse } from "../../system/directories";
import {
  deletePodmanSecrets,
  ensureServiceSecretsTracked,
  getPodmanSecretName,
} from "../../system/secrets";
import { journalctl } from "../../system/systemctl";
import {
  type FilesWriteResult,
  type ServicesEnableResult,
  type SetupStepAcquireResult,
  type SetupStepResource,
  createConfigValidator,
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
  LogOptions,
  ServiceContext,
  ServiceDefinition,
  ServiceEffect,
  ServiceStatus,
} from "../types";
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
 * Returns immutable GeneratedFiles with pre-built Maps.
 */
const generate = (
  ctx: ServiceContext<ImmichConfig>
): Effect.Effect<GeneratedFiles, ServiceError | GeneralError> =>
  Effect.sync(() => {
    const { config } = ctx;

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

    // Build containers immutably using array literal with conditional spread
    const dbSecretName = getPodmanSecretName(SERVICE_NAME, ImmichSecretNames.DB_PASSWORD);
    const serverDevices = hardware.transcoding ? mergeDevices(hardware.transcoding) : [];
    const serverEnv = hardware.transcoding ? mergeEnvironment(hardware.transcoding) : {};
    const networkHost = config.network?.host ?? "127.0.0.1";
    const networkPort = config.network?.port ?? 2283;

    // Redis container
    const redisContainer: StackContainer = {
      name: CONTAINERS.redis,
      description: "Immich Redis cache",
      image: config.containers?.redis?.image ?? DEFAULT_IMAGES.redis,
      healthCheck: createRedisHealthCheck(),
      readOnlyRootfs: true,
      noNewPrivileges: true,
      service: { restart: "always" },
    };

    // PostgreSQL container
    const postgresContainer: StackContainer = {
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
    };

    // Main server container
    const serverContainer: StackContainer = {
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
      devices: serverDevices.length > 0 ? [...serverDevices] : undefined,
      userNs: createKeepIdNs(),
      healthCheck: createHttpHealthCheck("http://localhost:2283/api/server/ping", {
        interval: "30s",
        startPeriod: "30s",
      }),
      noNewPrivileges: true,
      service: { restart: "always" },
    };

    // Machine Learning container (conditional)
    const mlEnabled = config.containers?.machineLearning?.enabled !== false;
    const mlContainer: StackContainer | undefined = mlEnabled
      ? (() => {
          const mlBaseImage = config.containers?.machineLearning?.image ?? DEFAULT_IMAGES.ml;
          const mlImage = getMlImage(mlBaseImage, config.hardware?.ml ?? { type: "disabled" });
          const mlDevices = mergeDevices(hardware.ml);
          const mlEnv = mergeEnvironment(hardware.ml);
          return {
            name: CONTAINERS.ml,
            description: "Immich Machine Learning",
            image: mlImage,
            volumes: [{ source: `${dataDir}/model-cache`, target: "/cache" }],
            environmentFiles: [`${ctx.paths.configDir}/immich.env`],
            environment: mlEnv,
            secrets: [createEnvSecret(dbSecretName, "DB_PASSWORD")],
            devices: mlDevices.length > 0 ? [...mlDevices] : undefined,
            healthCheck: createHttpHealthCheck("http://localhost:3003/ping", {
              interval: "30s",
              startPeriod: "60s",
            }),
            noNewPrivileges: true,
            service: { restart: "always" },
          };
        })()
      : undefined;

    // Build containers array immutably
    const containers: readonly StackContainer[] = [
      redisContainer,
      postgresContainer,
      serverContainer,
      ...(mlContainer ? [mlContainer] : []),
    ];

    // Create stack and generate quadlets
    const stack = createStack({
      name: "immich",
      network: { name: NETWORK_NAME, internal: true },
      containers: [...containers], // spread to mutable array for createStack
    });

    const stackFiles = generateStackQuadlets(stack, {
      envFilePath: configFilePath(ctx.paths.configDir, "immich.env"),
      userNs: createKeepIdNs(),
      selinuxEnforcing: ctx.system.selinuxEnforcing,
    });

    // Return GeneratedFiles with pre-built Maps (no mutations)
    return {
      quadlets: new Map(stackFiles.containers),
      networks: new Map(stackFiles.networks),
      volumes: new Map(stackFiles.volumes),
      environment: new Map([["immich.env", envContent]]),
      other: new Map(),
    };
  });

/**
 * Setup state for Immich - tracks data passed between steps.
 */
interface ImmichSetupState {
  files?: GeneratedFiles;
  createdSecrets?: readonly string[];
  createdDirs?: readonly AbsolutePath[];
  fileResults?: FilesWriteResult;
  serviceResults?: ServicesEnableResult;
}

/**
 * Full setup for Immich service.
 * Uses executeSetupStepsScoped for clean sequential execution with state threading.
 */
const setup = (
  ctx: ServiceContext<ImmichConfig>
): Effect.Effect<void, ServiceError | SystemError | ContainerError | GeneralError> => {
  const { config } = ctx;
  const dataDir = config.paths.dataDir;

  const steps: SetupStepResource<
    ImmichConfig,
    ImmichSetupState,
    ServiceError | SystemError | ContainerError | GeneralError
  >[] = [
    {
      message: "Generating secrets...",
      acquire: (
        ctx
      ): SetupStepAcquireResult<
        ImmichSetupState,
        ServiceError | SystemError | ContainerError | GeneralError
      > =>
        Effect.map(
          ensureServiceSecretsTracked(
            SERVICE_NAME,
            IMMICH_SECRETS,
            ctx.paths.homeDir,
            ctx.user.name,
            ctx.user.uid,
            ctx.user.gid
          ),
          ({ createdSecrets }) => ({ createdSecrets })
        ),
      release: (ctx, state, exit): Effect.Effect<void, never> =>
        Exit.isFailure(exit) && state.createdSecrets
          ? deletePodmanSecrets(state.createdSecrets, ctx.user.name, ctx.user.uid)
          : Effect.void,
    },
    {
      message: "Generating configuration files...",
      acquire: (
        ctx
      ): SetupStepAcquireResult<
        ImmichSetupState,
        ServiceError | SystemError | ContainerError | GeneralError
      > => Effect.map(generate(ctx), (files) => ({ files })),
      // No release - pure in-memory computation
    },
    {
      message: "Creating data directories...",
      acquire: (
        ctx
      ): SetupStepAcquireResult<
        ImmichSetupState,
        ServiceError | SystemError | ContainerError | GeneralError
      > => {
        const dirs = [
          `${dataDir}/upload`,
          `${dataDir}/profile`,
          `${dataDir}/thumbs`,
          `${dataDir}/encoded`,
          `${dataDir}/postgres`,
          `${dataDir}/model-cache`,
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
      message: "Writing configuration files...",
      acquire: (
        ctx,
        state
      ): SetupStepAcquireResult<
        ImmichSetupState,
        ServiceError | SystemError | ContainerError | GeneralError
      > =>
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
      message: "Reloading daemon and enabling services...",
      acquire: (
        ctx
      ): SetupStepAcquireResult<
        ImmichSetupState,
        ServiceError | SystemError | ContainerError | GeneralError
      > =>
        Effect.map(
          reloadAndEnableServicesTracked(
            ctx,
            [CONTAINERS.redis, CONTAINERS.postgres, CONTAINERS.server, CONTAINERS.ml],
            false
          ),
          (serviceResults) => ({ serviceResults })
        ),
      release: (ctx, state, exit): Effect.Effect<void, never> =>
        Exit.isFailure(exit) && state.serviceResults
          ? rollbackServiceChanges(ctx, state.serviceResults)
          : Effect.void,
    },
  ];

  return executeSetupStepsScoped<
    ImmichConfig,
    ImmichSetupState,
    ServiceError | SystemError | ContainerError | GeneralError
  >(ctx, steps, {});
};

/**
 * Start Immich service.
 */
const start = (
  ctx: ServiceContext<ImmichConfig>
): Effect.Effect<void, ServiceError | SystemError | GeneralError> => {
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
const stop = (
  ctx: ServiceContext<ImmichConfig>
): Effect.Effect<void, ServiceError | SystemError | GeneralError> => {
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
const restart = (
  ctx: ServiceContext<ImmichConfig>
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    ctx.logger.info("Restarting Immich...");
    yield* stop(ctx);
    yield* start(ctx);
  });

/**
 * Get Immich status.
 */
const status = (
  ctx: ServiceContext<ImmichConfig>
): Effect.Effect<ServiceStatus, ServiceError | SystemError> =>
  Effect.gen(function* () {
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
    const containerStatuses = yield* getStackStatus(stack, {
      user: ctx.user.name,
      uid: ctx.user.uid,
      logger: ctx.logger,
    });

    const allRunning = containerStatuses.every((c) => c.running);

    return {
      running: allRunning,
      containers: containerStatuses.map((c) => ({
        name: c.name,
        status: c.running ? { status: "running" as const } : { status: "stopped" as const },
      })),
    };
  });

/**
 * View Immich logs.
 */
const logs = (
  ctx: ServiceContext<ImmichConfig>,
  options: LogOptions
): Effect.Effect<void, ServiceError | SystemError> => {
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
const backup = (
  ctx: ServiceContext<ImmichConfig>
): Effect.Effect<BackupResult, BackupError | SystemError | GeneralError> => {
  const { config } = ctx;
  return wrapBackupResult(
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
): Effect.Effect<void, BackupError | SystemError | GeneralError> => {
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
export const immichService: ServiceEffect<ImmichConfig> = {
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
