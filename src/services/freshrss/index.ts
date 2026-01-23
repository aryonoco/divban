// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * FreshRSS service implementation.
 * Uses Effect's context system - dependencies accessed via yield*.
 */

import { Effect } from "effect";
import { backupService, restoreService } from "../../lib/db-backup";
import type { BackupError, GeneralError, ServiceError, SystemError } from "../../lib/errors";
import { type AbsolutePath, type ServiceName, duration, pathJoin } from "../../lib/types";
import { createHealthCheck, relabelVolumes } from "../../quadlet";
import { generateContainerQuadlet } from "../../quadlet/container";
import { ensureDirectoriesTracked, removeDirectoriesReverse } from "../../system/directories";
import {
  type AppLogger,
  ServiceOptions,
  type ServicePaths,
  ServiceUser,
  SystemCapabilities,
} from "../context";
import {
  type EmptyState,
  type FilesWriteResult,
  Outcome,
  type ServicesEnableResult,
  SetupStep,
  cleanupFileBackups,
  createConfigValidator,
  createSingleContainerOps,
  emptyState,
  pipeline,
  reloadAndEnableServicesTracked,
  rollbackFileWrites,
  rollbackServiceChanges,
  wrapBackupResult,
  writeGeneratedFilesTracked,
} from "../helpers";
import type { BackupResult, GeneratedFiles, ServiceDefinition, ServiceEffect } from "../types";
import { FreshRssConfigTag } from "./config";
import { type FreshRssConfig, freshRssConfigSchema, freshRssDefaults } from "./schema";

const SERVICE_NAME = "freshrss" as ServiceName;
const CONTAINER_NAME = "freshrss" as ServiceName;

const definition: ServiceDefinition = {
  name: SERVICE_NAME,
  description: "Self-hosted RSS feed aggregator",
  version: "0.1.0",
  capabilities: {
    multiContainer: false,
    hasReload: false,
    hasBackup: true,
    hasRestore: true,
    hardwareAcceleration: false,
  },
};

const ops = createSingleContainerOps({
  serviceName: CONTAINER_NAME,
  displayName: "FreshRSS",
});

const validate = createConfigValidator(freshRssConfigSchema);

const generate = (): Effect.Effect<
  GeneratedFiles,
  ServiceError | GeneralError,
  FreshRssConfigTag | SystemCapabilities
> =>
  Effect.gen(function* () {
    const config = yield* FreshRssConfigTag;
    const system = yield* SystemCapabilities;

    const port = config.network?.port ?? freshRssDefaults.network.port;
    const host = config.network?.host ?? freshRssDefaults.network.host;

    const quadletConfig: Parameters<typeof generateContainerQuadlet>[0] = {
      name: CONTAINER_NAME,
      containerName: CONTAINER_NAME,
      description: "FreshRSS Feed Aggregator",
      image: config.container?.image ?? freshRssDefaults.container.image,

      // Network - bind to localhost by default for security
      ports: [
        {
          hostIp: host,
          host: port,
          container: 80,
        },
      ],

      // Volumes
      volumes: relabelVolumes(
        [
          {
            source: config.paths.dataDir,
            target: "/var/www/FreshRSS/data",
          },
          {
            source: pathJoin(config.paths.dataDir, "extensions"),
            target: "/var/www/FreshRSS/extensions",
          },
        ],
        system.selinuxEnforcing
      ),

      // Environment variables
      environment: {
        TZ: config.timezone,
        ...(config.cronMinutes !== undefined && { CRON_MIN: config.cronMinutes }),
        ...(config.trustedProxy !== undefined && { TRUSTED_PROXY: config.trustedProxy }),
      },

      // User namespace
      userNs: {
        mode: "keep-id",
      },

      // Health check - matches official docker-compose timing
      healthCheck: createHealthCheck("cli/health.php", {
        interval: duration("75s"),
        timeout: duration("10s"),
        startPeriod: duration("60s"),
        retries: 3,
      }),

      readOnlyRootfs: false,
      noNewPrivileges: true,

      service: {
        restart: "always",
      },

      ...(config.container?.autoUpdate !== undefined && {
        autoUpdate: config.container.autoUpdate,
      }),
    };

    const containerQuadlet = generateContainerQuadlet(quadletConfig);

    return {
      quadlets: new Map([[`${CONTAINER_NAME}.container`, containerQuadlet.content]]),
      networks: new Map(),
      volumes: new Map(),
      environment: new Map(),
      other: new Map(),
    };
  });

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

const generateStep: SetupStep<
  EmptyState,
  GenerateOutput,
  ServiceError | GeneralError,
  FreshRssConfigTag | SystemCapabilities
> = SetupStep.pure("Generating configuration files...", (_state: EmptyState) =>
  Effect.map(generate(), (files): GenerateOutput => ({ files }))
);

const createDirsStep: SetupStep<
  EmptyState & GenerateOutput,
  CreateDirsOutput,
  SystemError | GeneralError,
  FreshRssConfigTag | ServiceUser
> = SetupStep.resource(
  "Creating data directories...",
  (_state: EmptyState & GenerateOutput) =>
    Effect.gen(function* () {
      const config = yield* FreshRssConfigTag;
      const user = yield* ServiceUser;

      const dataDir = config.paths.dataDir;
      const dirs = [dataDir, pathJoin(dataDir, "extensions")] as AbsolutePath[];

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

const writeFilesStep: SetupStep<
  EmptyState & GenerateOutput & CreateDirsOutput,
  WriteFilesOutput,
  SystemError | GeneralError,
  ServicePaths | ServiceUser
> = SetupStep.resource(
  "Writing quadlet files...",
  (state: EmptyState & GenerateOutput & CreateDirsOutput) =>
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

const enableServicesStep: SetupStep<
  EmptyState & GenerateOutput & CreateDirsOutput & WriteFilesOutput,
  EnableServicesOutput,
  ServiceError | SystemError | GeneralError,
  ServiceUser
> = SetupStep.resource(
  "Enabling service...",
  (_state: EmptyState & GenerateOutput & CreateDirsOutput & WriteFilesOutput) =>
    Effect.map(
      reloadAndEnableServicesTracked([CONTAINER_NAME], false),
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
  ServiceError | SystemError | GeneralError,
  FreshRssConfigTag | ServicePaths | ServiceUser | SystemCapabilities | AppLogger
> =>
  pipeline<EmptyState>()
    .andThen(generateStep)
    .andThen(createDirsStep)
    .andThen(writeFilesStep)
    .andThen(enableServicesStep)
    .execute(emptyState);

const backup = (): Effect.Effect<
  BackupResult,
  BackupError | ServiceError | SystemError | GeneralError,
  FreshRssConfigTag | ServiceUser | ServiceOptions | AppLogger
> =>
  Effect.gen(function* () {
    const config = yield* FreshRssConfigTag;
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
  FreshRssConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const config = yield* FreshRssConfigTag;
    const user = yield* ServiceUser;

    yield* restoreService(backupPath, config.backup, {
      serviceName: definition.name,
      dataDir: config.paths.dataDir,
      user: user.name,
      uid: user.uid,
    });
  });

export const freshRssService: ServiceEffect<
  FreshRssConfig,
  FreshRssConfigTag,
  typeof FreshRssConfigTag
> = {
  definition,
  configTag: FreshRssConfigTag,
  configSchema: freshRssConfigSchema,
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
