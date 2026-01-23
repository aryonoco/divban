// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Actual Budget service implementation.
 * Uses Effect's context system - dependencies accessed via yield*.
 */

import { Effect } from "effect";
import type { BackupError, GeneralError, ServiceError, SystemError } from "../../lib/errors";
import { type AbsolutePath, type ServiceName, duration } from "../../lib/types";
import { createHttpHealthCheck, relabelVolumes } from "../../quadlet";
import { generateContainerQuadlet } from "../../quadlet/container";
import { ensureDirectoriesTracked, removeDirectoriesReverse } from "../../system/directories";
import { AppLogger, type ServicePaths, ServiceUser, SystemCapabilities } from "../context";
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
import { backupActual, restoreActual } from "./commands/backup";
import { ActualConfigTag } from "./config";
import { type ActualConfig, actualConfigSchema } from "./schema";

const SERVICE_NAME = "actual" as ServiceName;
const CONTAINER_NAME = "actual" as ServiceName;

/**
 * Actual service definition.
 */
const definition: ServiceDefinition = {
  name: SERVICE_NAME,
  description: "Self-hosted personal finance management",
  version: "0.1.0",
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
 * Uses Effect context - no ctx parameter needed.
 */
const ops = createSingleContainerOps({
  serviceName: CONTAINER_NAME,
  displayName: "Actual",
});

/**
 * Validate Actual configuration file.
 */
const validate = createConfigValidator(actualConfigSchema);

/**
 * Generate all files for Actual service.
 * Dependencies accessed via Effect context.
 */
const generate = (): Effect.Effect<
  GeneratedFiles,
  ServiceError | GeneralError,
  ActualConfigTag | SystemCapabilities
> =>
  Effect.gen(function* () {
    const config = yield* ActualConfigTag;
    const system = yield* SystemCapabilities;

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
        system.selinuxEnforcing
      ),

      // User namespace
      userNs: {
        mode: "keep-id",
      },

      // Health check
      healthCheck: createHttpHealthCheck("http://localhost:5006/", {
        interval: duration("30s"),
        startPeriod: duration("10s"),
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

// ============================================================================
// Setup Step Output Types
// ============================================================================

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

/** Step 1: Generate (pure - no release) */
const generateStep: SetupStep<
  EmptyState,
  GenerateOutput,
  ServiceError | GeneralError,
  ActualConfigTag | SystemCapabilities
> = SetupStep.pure("Generating configuration files...", (_state: EmptyState) =>
  Effect.map(generate(), (files): GenerateOutput => ({ files }))
);

/** Step 2: Create directories (resource - has release) */
const createDirsStep: SetupStep<
  EmptyState & GenerateOutput,
  CreateDirsOutput,
  SystemError | GeneralError,
  ActualConfigTag | ServiceUser
> = SetupStep.resource(
  "Creating data directories...",
  (_state: EmptyState & GenerateOutput) =>
    Effect.gen(function* () {
      const config = yield* ActualConfigTag;
      const user = yield* ServiceUser;

      const dataDir = config.paths.dataDir;
      const dirs = [
        dataDir,
        `${dataDir}/server-files`,
        `${dataDir}/user-files`,
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

/** Step 3: Write files (resource - has release) */
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

/** Step 4: Enable services (resource - has release) */
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

/**
 * Full setup for Actual service.
 * Dependencies accessed via Effect context.
 */
const setup = (): Effect.Effect<
  void,
  ServiceError | SystemError | GeneralError,
  ActualConfigTag | ServicePaths | ServiceUser | SystemCapabilities | AppLogger
> =>
  pipeline<EmptyState>()
    .andThen(generateStep)
    .andThen(createDirsStep)
    .andThen(writeFilesStep)
    .andThen(enableServicesStep)
    .execute(emptyState);

/**
 * Backup Actual data.
 * Dependencies accessed via Effect context.
 */
const backup = (): Effect.Effect<
  BackupResult,
  BackupError | SystemError | GeneralError,
  ActualConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const config = yield* ActualConfigTag;
    const user = yield* ServiceUser;
    const logger = yield* AppLogger;

    return yield* wrapBackupResult(
      backupActual({
        dataDir: config.paths.dataDir as AbsolutePath,
        user: user.name,
        uid: user.uid,
        logger,
      })
    );
  });

/**
 * Restore Actual data from backup.
 * Dependencies accessed via Effect context.
 */
const restore = (
  backupPath: AbsolutePath
): Effect.Effect<
  void,
  BackupError | SystemError | GeneralError,
  ActualConfigTag | ServiceUser | AppLogger
> =>
  Effect.gen(function* () {
    const config = yield* ActualConfigTag;
    const user = yield* ServiceUser;
    const logger = yield* AppLogger;

    yield* restoreActual(
      backupPath,
      config.paths.dataDir as AbsolutePath,
      user.name,
      user.uid,
      logger
    );
  });

/**
 * Actual service implementation.
 */
export const actualService: ServiceEffect<ActualConfig, ActualConfigTag, typeof ActualConfigTag> = {
  definition,
  configTag: ActualConfigTag,
  configSchema: actualConfigSchema,
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
