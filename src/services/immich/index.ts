// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Array as Arr, Effect, pipe } from "effect";
import { backupService, restoreService } from "../../lib/db-backup";
import type {
  BackupError,
  ContainerError,
  GeneralError,
  ServiceError,
  SystemError,
} from "../../lib/errors";
import { configFilePath } from "../../lib/paths";
import {
  type AbsolutePath,
  containerImage,
  duration,
  pathJoin,
  serviceName,
} from "../../lib/types";
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
import { ServiceOptions, ServicePaths, ServiceUser, SystemCapabilities } from "../context";
import {
  type EmptyState,
  type FilesWriteResult,
  Outcome,
  type ServicesEnableResult,
  SetupStep,
  cleanupFileBackups,
  createConfigValidator,
  emptyState,
  pipeline,
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
import { ImmichConfigTag } from "./config";
import { CONTAINERS, DEFAULT_IMAGES, INTERNAL_URLS, NETWORK_NAME } from "./constants";
import { getHardwareConfig, getMlImage, mergeDevices, mergeEnvironment } from "./hardware";
import { getLibraryEnvironment, librariesToVolumeMounts } from "./libraries";
import { type ImmichConfig, immichConfigSchema } from "./schema";
import { IMMICH_SECRETS, ImmichSecretNames } from "./secrets";

const SERVICE_NAME = serviceName("immich");

// Placeholder image for stack operations (start/stop/status) where actual image is irrelevant
const PLACEHOLDER_IMAGE = containerImage("placeholder");

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

const validate = createConfigValidator(immichConfigSchema);

const generate = (): Effect.Effect<
  GeneratedFiles,
  ServiceError | GeneralError,
  ImmichConfigTag | ServicePaths | SystemCapabilities
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const paths = yield* ServicePaths;
    const system = yield* SystemCapabilities;

    const hardware = getHardwareConfig(
      config.hardware?.transcoding ?? { type: "disabled" },
      config.hardware?.ml ?? { type: "disabled" }
    );

    const libraryMounts = librariesToVolumeMounts(config.externalLibraries);
    const libraryEnv = getLibraryEnvironment(config.externalLibraries);

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

    const dbSecretName = getPodmanSecretName(SERVICE_NAME, ImmichSecretNames.DB_PASSWORD);
    const serverDevices = hardware.transcoding ? mergeDevices(hardware.transcoding) : [];
    const serverEnv = hardware.transcoding ? mergeEnvironment(hardware.transcoding) : {};
    const networkHost = config.network?.host ?? "127.0.0.1";
    const networkPort = config.network?.port ?? 2283;

    const redisContainer: StackContainer = {
      name: CONTAINERS.redis,
      description: "Immich Redis cache",
      image: config.containers?.redis?.image ?? DEFAULT_IMAGES.redis,
      healthCheck: createRedisHealthCheck(),
      readOnlyRootfs: true,
      noNewPrivileges: true,
      service: { restart: "always" },
    };

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

    const containers: readonly StackContainer[] = [
      redisContainer,
      postgresContainer,
      serverContainer,
      ...(mlContainer ? [mlContainer] : []),
    ];

    const stack = createStack({
      name: SERVICE_NAME,
      network: { name: NETWORK_NAME, internal: true },
      containers: [...containers], // spread to mutable array for createStack
    });

    const stackFiles = generateStackQuadlets(stack, {
      envFilePath: configFilePath(paths.configDir, "immich.env"),
      userNs: createKeepIdNs(),
      selinuxEnforcing: system.selinuxEnforcing,
    });

    return {
      quadlets: new Map(stackFiles.containers),
      networks: new Map(stackFiles.networks),
      volumes: new Map(stackFiles.volumes),
      environment: new Map([["immich.env", envContent]]),
      other: new Map(),
    };
  });

interface SecretsOutput {
  readonly createdSecrets: readonly string[];
}

interface GenerateOutput {
  readonly files: GeneratedFiles;
}

interface CreateDirsOutput {
  readonly createdDirs: readonly AbsolutePath[];
}

interface WriteFilesOutput {
  readonly fileResults: FilesWriteResult;
}

interface EnableServicesOutput {
  readonly serviceResults: ServicesEnableResult;
}

/** Generates secrets and deletes them on rollback. */
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

const generateStep: SetupStep<
  EmptyState & SecretsOutput,
  GenerateOutput,
  ServiceError | GeneralError,
  ImmichConfigTag | ServicePaths | SystemCapabilities
> = SetupStep.pure("Generating configuration files...", (_state: EmptyState & SecretsOutput) =>
  Effect.map(generate(), (files): GenerateOutput => ({ files }))
);

/** Creates data directories and removes them on rollback. */
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
      const dirs: readonly AbsolutePath[] = [
        pathJoin(dataDir, "upload"),
        pathJoin(dataDir, "profile"),
        pathJoin(dataDir, "thumbs"),
        pathJoin(dataDir, "encoded"),
        pathJoin(dataDir, "postgres"),
        pathJoin(dataDir, "model-cache"),
        pathJoin(dataDir, "backups"),
      ];

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

/** Writes config files with backup; restores from backup on rollback. */
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

/** Enables systemd services; disables them on rollback. */
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

const setup = (): Effect.Effect<
  void,
  ServiceError | SystemError | ContainerError | GeneralError,
  ImmichConfigTag | ServicePaths | ServiceUser | SystemCapabilities
> =>
  pipeline<EmptyState>()
    .andThen(secretsStep)
    .andThen(generateStep)
    .andThen(createDirsStep)
    .andThen(writeFilesStep)
    .andThen(enableServicesStep)
    .execute(emptyState);

const start = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const user = yield* ServiceUser;

    const mlEnabled = config.containers?.machineLearning?.enabled !== false;
    const baseContainers: StackContainer[] = [
      { name: CONTAINERS.redis, image: PLACEHOLDER_IMAGE, requires: [] },
      { name: CONTAINERS.postgres, image: PLACEHOLDER_IMAGE, requires: [CONTAINERS.redis] },
      {
        name: CONTAINERS.server,
        image: PLACEHOLDER_IMAGE,
        requires: [CONTAINERS.redis, CONTAINERS.postgres],
      },
    ];
    const containers = pipe(
      baseContainers,
      Arr.appendAll(
        mlEnabled ? [{ name: CONTAINERS.ml, image: PLACEHOLDER_IMAGE, requires: [] }] : []
      )
    );

    const stack = createStack({ name: SERVICE_NAME, containers: [...containers] });
    yield* startStack(stack, { user: user.name, uid: user.uid });
  });

const stop = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const user = yield* ServiceUser;

    const mlEnabled = config.containers?.machineLearning?.enabled !== false;
    const baseContainers: StackContainer[] = [
      {
        name: CONTAINERS.server,
        image: PLACEHOLDER_IMAGE,
        requires: [CONTAINERS.redis, CONTAINERS.postgres],
      },
      { name: CONTAINERS.postgres, image: PLACEHOLDER_IMAGE, requires: [CONTAINERS.redis] },
      { name: CONTAINERS.redis, image: PLACEHOLDER_IMAGE },
    ];
    const containers = pipe(
      baseContainers,
      Arr.prependAll(mlEnabled ? [{ name: CONTAINERS.ml, image: PLACEHOLDER_IMAGE }] : [])
    );

    const stack = createStack({ name: SERVICE_NAME, containers: [...containers] });
    yield* stopStack(stack, { user: user.name, uid: user.uid });
  });

const restart = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser
> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Restarting Immich...");
    yield* stop();
    yield* start();
  });

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
      { name: CONTAINERS.redis, image: PLACEHOLDER_IMAGE },
      { name: CONTAINERS.postgres, image: PLACEHOLDER_IMAGE },
      { name: CONTAINERS.server, image: PLACEHOLDER_IMAGE },
    ];
    const containers = pipe(
      baseContainers,
      Arr.appendAll(mlEnabled ? [{ name: CONTAINERS.ml, image: PLACEHOLDER_IMAGE }] : [])
    );

    const stack = createStack({ name: SERVICE_NAME, containers: [...containers] });
    const containerStatuses = yield* getStackStatus(stack, {
      user: user.name,
      uid: user.uid,
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

const backup = (): Effect.Effect<
  BackupResult,
  BackupError | ServiceError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser | ServiceOptions
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const user = yield* ServiceUser;
    const options = yield* ServiceOptions;

    return yield* wrapBackupResult(
      backupService(config.backup, {
        serviceName: definition.name,
        dataDir: config.paths.dataDir,
        user: user.name,
        uid: user.uid,
        force: options.force,
      })
    );
  });

const restore = (
  backupPath: AbsolutePath
): Effect.Effect<
  void,
  BackupError | ServiceError | SystemError | GeneralError,
  ImmichConfigTag | ServiceUser
> =>
  Effect.gen(function* () {
    const config = yield* ImmichConfigTag;
    const user = yield* ServiceUser;

    yield* restoreService(backupPath, config.backup, {
      serviceName: definition.name,
      dataDir: config.paths.dataDir,
      user: user.name,
      uid: user.uid,
    });
  });

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
