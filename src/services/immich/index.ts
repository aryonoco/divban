// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Immich photo management service implementation.
 * Multi-container service with hardware acceleration support.
 * Uses Effect's context system - dependencies accessed via yield*.
 */

import { Array as Arr, Effect, pipe } from "effect";
import type {
  BackupError,
  ContainerError,
  GeneralError,
  ServiceError,
  SystemError,
} from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { configFilePath } from "../../lib/paths";
import { type AbsolutePath, type ServiceName, duration } from "../../lib/types";
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
import { AppLogger, ServicePaths, ServiceUser, SystemCapabilities } from "../context";
import {
  type EmptyState,
  type FilesWriteResult,
  Outcome,
  type ServicesEnableResult,
  SetupStep,
  cleanupFileBackups,
  createConfigValidator,
  emptyState,
  executeSteps5,
  reloadAndEnableServicesTracked,
  rollbackFileWrites,
  rollbackServiceChanges,
  wrapBackupResult,
  writeGeneratedFilesTracked,
} from "../helpers";
import type {
  BackupResult,
  GeneratedFiles,
  LogOptions,
  ServiceDefinition,
  ServiceEffect,
  ServiceStatus,
} from "../types";
import { backupDatabase } from "./commands/backup";
import { restoreDatabase } from "./commands/restore";
import { ImmichConfigTag } from "./config";
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
 * Dependencies accessed via Effect context.
 */
const generate = (): Effect.Effect<
  GeneratedFiles,
  ServiceError | GeneralError,
  ImmichConfigTag | ServicePaths | SystemCapabilities
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const paths = yield* ServicePaths;
    const system = yield* SystemCapabilities;

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
      environmentFiles: [`${paths.configDir}/immich.env`],
      environment: serverEnv,
      secrets: [createEnvSecret(dbSecretName, "DB_PASSWORD")],
      devices: serverDevices.length > 0 ? [...serverDevices] : undefined,
      userNs: createKeepIdNs(),
      healthCheck: createHttpHealthCheck("http://localhost:2283/api/server/ping", {
        interval: duration("30s"),
        startPeriod: duration("30s"),
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
            environmentFiles: [`${paths.configDir}/immich.env`],
            environment: mlEnv,
            secrets: [createEnvSecret(dbSecretName, "DB_PASSWORD")],
            devices: mlDevices.length > 0 ? [...mlDevices] : undefined,
            healthCheck: createHttpHealthCheck("http://localhost:3003/ping", {
              interval: duration("30s"),
              startPeriod: duration("60s"),
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
      envFilePath: configFilePath(paths.configDir, "immich.env"),
      userNs: createKeepIdNs(),
      selinuxEnforcing: system.selinuxEnforcing,
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

// ============================================================================
// Setup Step Output Types
// ============================================================================

/** Output from secrets step */
interface SecretsOutput {
  readonly createdSecrets: readonly string[];
}

/** Output from generate step */
interface GenerateOutput {
  readonly files: GeneratedFiles;
}

/** Output from create directories step */
interface CreateDirsOutput {
  readonly createdDirs: readonly AbsolutePath[];
}

/** Output from write files step */
interface WriteFilesOutput {
  readonly fileResults: FilesWriteResult;
}

/** Output from enable services step */
interface EnableServicesOutput {
  readonly serviceResults: ServicesEnableResult;
}

// ============================================================================
// Setup Steps
// ============================================================================

/** Step 1: Generate secrets (resource - has release) */
const secretsStep: SetupStep<
  EmptyState,
  SecretsOutput,
  SystemError | GeneralError | ContainerError,
  ServicePaths | ServiceUser
> = SetupStep.resource(
  "Generating secrets...",
  (_state: EmptyState) =>
    Effect.gen(function* () {
      const paths = yield* ServicePaths;
      const user = yield* ServiceUser;

      const { createdSecrets } = yield* ensureServiceSecretsTracked(
        SERVICE_NAME,
        IMMICH_SECRETS,
        paths.homeDir,
        user.name,
        user.uid,
        user.gid
      );
      return { createdSecrets };
    }),
  (state, outcome): Effect.Effect<void, never, ServiceUser> =>
    Outcome.match(outcome, {
      onSuccess: (): Effect.Effect<void, never, never> => Effect.void,
      onFailure: (): Effect.Effect<void, never, ServiceUser> =>
        state.createdSecrets.length > 0
          ? Effect.gen(function* () {
              const user = yield* ServiceUser;
              yield* deletePodmanSecrets([...state.createdSecrets], user.name, user.uid);
            })
          : Effect.void,
    })
);

/** Step 2: Generate (pure - no release) */
const generateStep: SetupStep<
  EmptyState & SecretsOutput,
  GenerateOutput,
  ServiceError | GeneralError,
  ImmichConfigTag | ServicePaths | SystemCapabilities
> = SetupStep.pure("Generating configuration files...", (_state: EmptyState & SecretsOutput) =>
  Effect.map(generate(), (files): GenerateOutput => ({ files }))
);

/** Step 3: Create directories (resource - has release) */
const createDirsStep: SetupStep<
  EmptyState & SecretsOutput & GenerateOutput,
  CreateDirsOutput,
  SystemError | GeneralError,
  ImmichConfigTag | ServiceUser
> = SetupStep.resource(
  "Creating data directories...",
  (_state: EmptyState & SecretsOutput & GenerateOutput) =>
    Effect.gen(function* () {
      const config = yield* ImmichConfigTag;
      const user = yield* ServiceUser;

      const dataDir = config.paths.dataDir;
      const dirs = [
        `${dataDir}/upload`,
        `${dataDir}/profile`,
        `${dataDir}/thumbs`,
        `${dataDir}/encoded`,
        `${dataDir}/postgres`,
        `${dataDir}/model-cache`,
        `${dataDir}/backups`,
      ] as AbsolutePath[];

      const { createdPaths } = yield* ensureDirectoriesTracked(dirs, {
        uid: user.uid,
        gid: user.gid,
      });
      return { createdDirs: createdPaths };
    }),
  (state, outcome): Effect.Effect<void, never, never> =>
    Outcome.match(outcome, {
      onSuccess: (): Effect.Effect<void, never, never> => Effect.void,
      onFailure: (): Effect.Effect<void, never, never> =>
        removeDirectoriesReverse(state.createdDirs),
    })
);

/** Step 4: Write files (resource - has release) */
const writeFilesStep: SetupStep<
  EmptyState & SecretsOutput & GenerateOutput & CreateDirsOutput,
  WriteFilesOutput,
  SystemError | GeneralError,
  ServicePaths | ServiceUser
> = SetupStep.resource(
  "Writing configuration files...",
  (state: EmptyState & SecretsOutput & GenerateOutput & CreateDirsOutput) =>
    Effect.map(
      writeGeneratedFilesTracked(state.files),
      (fileResults): WriteFilesOutput => ({ fileResults })
    ),
  (state, outcome): Effect.Effect<void, never, never> =>
    Outcome.match(outcome, {
      onSuccess: (): Effect.Effect<void, never, never> =>
        cleanupFileBackups(state.fileResults.results),
      onFailure: (): Effect.Effect<void, never, never> =>
        rollbackFileWrites(state.fileResults.results),
    })
);

/** Step 5: Enable services (resource - has release) */
const enableServicesStep: SetupStep<
  EmptyState & SecretsOutput & GenerateOutput & CreateDirsOutput & WriteFilesOutput,
  EnableServicesOutput,
  ServiceError | SystemError | GeneralError,
  ServiceUser
> = SetupStep.resource(
  "Reloading daemon and enabling services...",
  (_state: EmptyState & SecretsOutput & GenerateOutput & CreateDirsOutput & WriteFilesOutput) =>
    Effect.map(
      reloadAndEnableServicesTracked(
        [CONTAINERS.redis, CONTAINERS.postgres, CONTAINERS.server, CONTAINERS.ml],
        false
      ),
      (serviceResults): EnableServicesOutput => ({ serviceResults })
    ),
  (state, outcome): Effect.Effect<void, never, ServiceUser> =>
    Outcome.match(outcome, {
      onSuccess: (): Effect.Effect<void, never, never> => Effect.void,
      onFailure: (): Effect.Effect<void, never, ServiceUser> =>
        rollbackServiceChanges(state.serviceResults),
    })
);

/**
 * Full setup for Immich service.
 * Dependencies accessed via Effect context.
 */
const setup = (): Effect.Effect<
  void,
  ServiceError | SystemError | ContainerError | GeneralError,
  ImmichConfigTag | ServicePaths | ServiceUser | SystemCapabilities | AppLogger
> =>
  executeSteps5(
    [secretsStep, generateStep, createDirsStep, writeFilesStep, enableServicesStep],
    emptyState
  );

/**
 * Start Immich service.
 * Dependencies accessed via Effect context.
 */
const start = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const user = yield* ServiceUser;
    const logger = yield* AppLogger;

    const mlEnabled = config.containers?.machineLearning?.enabled !== false;
    const baseContainers: StackContainer[] = [
      { name: CONTAINERS.redis, image: "", requires: [] },
      { name: CONTAINERS.postgres, image: "", requires: [CONTAINERS.redis] },
      { name: CONTAINERS.server, image: "", requires: [CONTAINERS.redis, CONTAINERS.postgres] },
    ];
    const containers = pipe(
      baseContainers,
      Arr.appendAll(mlEnabled ? [{ name: CONTAINERS.ml, image: "", requires: [] }] : [])
    );

    const stack = createStack({ name: "immich", containers: [...containers] });
    yield* startStack(stack, { user: user.name, uid: user.uid, logger });
  });

/**
 * Stop Immich service.
 * Dependencies accessed via Effect context.
 */
const stop = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const user = yield* ServiceUser;
    const logger = yield* AppLogger;

    const mlEnabled = config.containers?.machineLearning?.enabled !== false;
    const baseContainers: StackContainer[] = [
      { name: CONTAINERS.server, image: "", requires: [CONTAINERS.redis, CONTAINERS.postgres] },
      { name: CONTAINERS.postgres, image: "", requires: [CONTAINERS.redis] },
      { name: CONTAINERS.redis, image: "" },
    ];
    const containers = pipe(
      baseContainers,
      Arr.prependAll(mlEnabled ? [{ name: CONTAINERS.ml, image: "" }] : [])
    );

    const stack = createStack({ name: "immich", containers: [...containers] });
    yield* stopStack(stack, { user: user.name, uid: user.uid, logger });
  });

/**
 * Restart Immich service.
 * Dependencies accessed via Effect context.
 */
const restart = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const logger = yield* AppLogger;
    logger.info("Restarting Immich...");
    yield* stop();
    yield* start();
  });

/**
 * Get Immich status.
 * Dependencies accessed via Effect context.
 */
const status = (): Effect.Effect<
  ServiceStatus,
  ServiceError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const user = yield* ServiceUser;

    const mlEnabled = config.containers?.machineLearning?.enabled !== false;
    const baseContainers: StackContainer[] = [
      { name: CONTAINERS.redis, image: "" },
      { name: CONTAINERS.postgres, image: "" },
      { name: CONTAINERS.server, image: "" },
    ];
    const containers = pipe(
      baseContainers,
      Arr.appendAll(mlEnabled ? [{ name: CONTAINERS.ml, image: "" }] : [])
    );

    const stack = createStack({ name: "immich", containers: [...containers] });
    // Note: getStackStatus requires logger but we can use a no-op one since status is just a query
    const noopLogger: Logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      success: () => undefined,
      fail: () => undefined,
      step: () => undefined,
      raw: () => undefined,
      child: () => noopLogger,
    };
    const containerStatuses = yield* getStackStatus(stack, {
      user: user.name,
      uid: user.uid,
      logger: noopLogger,
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
 * Dependencies accessed via Effect context.
 */
const logs = (
  options: LogOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError, ImmichConfigTag | ServiceUser> =>
  Effect.gen(function* () {
    const user = yield* ServiceUser;

    const unit = options.container
      ? `${options.container}.service`
      : `${CONTAINERS.server}.service`;

    yield* journalctl(unit, {
      user: user.name,
      uid: user.uid,
      follow: options.follow,
      lines: options.lines,
    });
  });

/**
 * Backup Immich database.
 * Dependencies accessed via Effect context.
 */
const backup = (): Effect.Effect<
  BackupResult,
  BackupError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const user = yield* ServiceUser;
    const logger = yield* AppLogger;

    return yield* wrapBackupResult(
      backupDatabase({
        dataDir: config.paths.dataDir as AbsolutePath,
        user: user.name,
        uid: user.uid,
        logger,
        database: config.database.database,
        dbUser: config.database.username,
      })
    );
  });

/**
 * Restore Immich database.
 * Dependencies accessed via Effect context.
 */
const restore = (
  backupPath: AbsolutePath
): Effect.Effect<
  void,
  BackupError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const user = yield* ServiceUser;
    const logger = yield* AppLogger;

    yield* restoreDatabase({
      backupPath,
      user: user.name,
      uid: user.uid,
      logger,
      database: config.database.database,
      dbUser: config.database.username,
    });
  });

/**
 * Immich service implementation.
 */
export const immichService: ServiceEffect<ImmichConfig, ImmichConfigTag, typeof ImmichConfigTag> = {
  definition,
  configTag: ImmichConfigTag,
  configSchema: immichConfigSchema,
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
