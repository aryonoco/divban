// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Configuration backup separate from data backup. Captures TOML configs
 * and encrypted secrets - everything needed to recreate the service on
 * a new system. Stored separately from data because configs change less
 * frequently and are much smaller.
 */

import { Glob } from "bun";
import { Effect, Match, Option, pipe } from "effect";
import { getServiceUsername } from "../../config/schema";
import { CURRENT_BACKUP_SCHEMA_VERSION } from "../../lib/backup-compat";
import { createBackupTimestamp } from "../../lib/backup-utils";
import { collectAsyncOrDie } from "../../lib/collection-utils";
import {
  type ConfigError,
  ErrorCode,
  GeneralError,
  ServiceError,
  type SystemError,
} from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { toAbsolutePathEffect, userConfigDir } from "../../lib/paths";
import { type AbsolutePath, type ServiceName, pathJoin, serviceName } from "../../lib/types";
import { DIVBAN_PRODUCER_NAME, DIVBAN_VERSION } from "../../lib/version";
import type { ExistentialService } from "../../services/types";
import { type ArchiveMetadata, createArchive } from "../../system/archive";
import {
  directoryExists,
  ensureDirectory,
  fileExists,
  readBytes,
  writeBytes,
} from "../../system/fs";
import { getUserByName } from "../../system/user";
import { formatBytes } from "./utils";

export interface BackupConfigOptions {
  readonly service: ExistentialService;
  readonly outputPath: string | undefined;
  readonly dryRun: boolean;
  readonly format: "pretty" | "json";
  readonly logger: Logger;
}

/** Tuple of [archive-relative path, raw bytes] for tar archive construction. */
type FileEntry = readonly [string, Uint8Array];

// ============================================================================
// File Collection - Parallel I/O with Effect
// ============================================================================

/**
 * Returns null for missing files since not all services have all file types
 * (e.g., some lack encrypted secrets). Callers filter nulls after parallel reads.
 */
const readFileIfExists = (
  path: AbsolutePath,
  archiveName: string
): Effect.Effect<FileEntry | null, SystemError | GeneralError> =>
  Effect.gen(function* () {
    if (!(yield* fileExists(path))) {
      return null;
    }
    const bytes = yield* readBytes(path);
    return [archiveName, bytes] as const;
  });

/**
 * Gathers the three config file types a service may have: TOML config,
 * age decryption key, and encrypted secrets file. Missing files are skipped.
 */
const collectServiceConfigFiles = (
  configDir: AbsolutePath,
  serviceName: ServiceName
): Effect.Effect<Record<string, Uint8Array>, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const candidates = [
      [pathJoin(configDir, `${serviceName}.toml`), `${serviceName}.toml`],
      [pathJoin(configDir, ".age", `${serviceName}.key`), `.age/${serviceName}.key`],
      [pathJoin(configDir, `${serviceName}.secrets.age`), `${serviceName}.secrets.age`],
    ] as const;

    const results = yield* Effect.all(
      candidates.map(([path, name]) => readFileIfExists(path, name)),
      { concurrency: "unbounded" }
    );

    return Object.fromEntries(results.filter((entry): entry is FileEntry => entry !== null));
  });

const readFileAsEntry = (
  filePath: AbsolutePath,
  archiveName: string
): Effect.Effect<FileEntry, SystemError | GeneralError> =>
  Effect.map(readBytes(filePath), (bytes) => [archiveName, bytes] as const);

/**
 * Maps glob matches to archive entries with optional path prefix,
 * preserving relative directory structure in the resulting archive.
 */
const scanAndReadFiles = (
  baseDir: AbsolutePath,
  pattern: string,
  archivePrefix = ""
): Effect.Effect<FileEntry[], SystemError | GeneralError> =>
  Effect.gen(function* () {
    const glob = new Glob(pattern);
    const files = yield* collectAsyncOrDie(glob.scan({ cwd: baseDir, onlyFiles: true }));

    const results = yield* Effect.all(
      files.map((file) => {
        const filePath = pathJoin(baseDir, file);
        const archiveName = archivePrefix ? `${archivePrefix}${file}` : file;
        return readFileAsEntry(filePath, archiveName);
      }),
      { concurrency: "unbounded" }
    );

    return [...results];
  });

/**
 * Multi-service backup: collects all TOML configs, encrypted secrets,
 * and age keys from the shared config directory.
 */
const collectAllConfigFiles = (
  configDir: AbsolutePath
): Effect.Effect<Record<string, Uint8Array>, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const ageDir = pathJoin(configDir, ".age");
    const hasAgeDir = yield* directoryExists(ageDir);

    const [tomlFiles, secretFiles, ageFiles] = yield* Effect.all(
      [
        scanAndReadFiles(configDir, "*.toml"),
        scanAndReadFiles(configDir, "*.secrets.age"),
        hasAgeDir ? scanAndReadFiles(ageDir, "*.key", ".age/") : Effect.succeed([] as FileEntry[]),
      ],
      { concurrency: "unbounded" }
    );

    return Object.fromEntries([...tomlFiles, ...secretFiles, ...ageFiles]);
  });

// ============================================================================
// Config Directory Resolution
// ============================================================================

/**
 * Services store configs in their dedicated user's home directory.
 * This indirection allows backup to work without knowing the exact path.
 */
const getServiceConfigDir = (
  serviceName: ServiceName
): Effect.Effect<AbsolutePath, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const username = yield* getServiceUsername(serviceName);
    const { homeDir } = yield* getUserByName(username).pipe(
      Effect.mapError(
        () =>
          new ServiceError({
            code: ErrorCode.SERVICE_NOT_FOUND as 30,
            message: `Service '${serviceName}' not set up`,
            service: serviceName,
          })
      )
    );
    const configDir = userConfigDir(homeDir);
    const exists = yield* directoryExists(configDir);
    yield* Effect.if(!exists, {
      onTrue: (): Effect.Effect<void, ServiceError> =>
        Effect.fail(
          new ServiceError({
            code: ErrorCode.SERVICE_NOT_FOUND as 30,
            message: `Config directory not found for ${serviceName}`,
            service: serviceName,
          })
        ),
      onFalse: (): Effect.Effect<void> => Effect.void,
    });
    return configDir;
  });

/**
 * For "all" backup mode: probes known services to locate the shared
 * config directory without requiring the user to specify a service.
 */
const findConfigDir = (): Effect.Effect<
  AbsolutePath,
  ServiceError | SystemError | GeneralError
> => {
  const knownServices: ServiceName[] = [
    serviceName("immich"),
    serviceName("caddy"),
    serviceName("actual"),
  ];

  return pipe(
    Effect.firstSuccessOf(knownServices.map((svc) => getServiceConfigDir(svc))),
    Effect.catchAll(() =>
      Effect.fail(
        new ServiceError({
          code: ErrorCode.SERVICE_NOT_FOUND as 30,
          message: "No configured services found. Run 'divban setup <service>' first.",
          service: "all",
        })
      )
    )
  );
};

const resolveConfigDir = (
  serviceName: ServiceName | "all"
): Effect.Effect<AbsolutePath, ServiceError | SystemError | GeneralError | ConfigError> =>
  serviceName === "all" ? findConfigDir() : getServiceConfigDir(serviceName);

// ============================================================================
// Output Path Preparation
// ============================================================================

/**
 * Defaults to configDir/backups/ with timestamp to keep archives
 * alongside configs they describe, simplifying restore workflows.
 */
const prepareOutputPath = (
  configDir: AbsolutePath,
  serviceName: ServiceName | "all",
  customPath: string | undefined
): Effect.Effect<AbsolutePath, SystemError | GeneralError | ConfigError> =>
  Option.match(Option.fromNullable(customPath), {
    onSome: (path): Effect.Effect<AbsolutePath, SystemError | GeneralError | ConfigError> =>
      toAbsolutePathEffect(path),
    onNone: (): Effect.Effect<AbsolutePath, SystemError | GeneralError | ConfigError> =>
      Effect.gen(function* () {
        const timestamp = createBackupTimestamp();
        const filename = `config-backup-${serviceName}-${timestamp}.tar.gz`;
        const backupDir = pathJoin(configDir, "backups");

        yield* ensureDirectory(backupDir);
        return pathJoin(backupDir, filename);
      }),
  });

// ============================================================================
// Main Command Execution
// ============================================================================

export const executeBackupConfig = (
  options: BackupConfigOptions
): Effect.Effect<void, GeneralError | ServiceError | SystemError | ConfigError> =>
  Effect.gen(function* () {
    const { service, outputPath, dryRun, format, logger } = options;
    const svcName = service.definition.name;
    const isAll = svcName === "all";

    // Step 1: Resolve config directory
    const configDir = yield* resolveConfigDir(svcName);

    // Step 2: Collect files (parallel I/O)
    logger.info("Collecting configuration files...");
    const files = yield* Effect.if(isAll, {
      onTrue: (): Effect.Effect<Record<string, Uint8Array>, SystemError | GeneralError> =>
        collectAllConfigFiles(configDir),
      onFalse: (): Effect.Effect<Record<string, Uint8Array>, SystemError | GeneralError> =>
        collectServiceConfigFiles(configDir, svcName),
    });

    const fileNames = Object.keys(files);

    return yield* Effect.if(fileNames.length === 0, {
      onTrue: (): Effect.Effect<never, GeneralError> =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `No configuration files found for ${svcName}`,
          })
        ),
      onFalse: (): Effect.Effect<void, GeneralError | ServiceError | SystemError | ConfigError> =>
        Effect.gen(function* () {
          // Step 3: Prepare output path
          const resolvedOutputPath = yield* prepareOutputPath(configDir, svcName, outputPath);

          return yield* Effect.if(dryRun, {
            // Step 4: Handle dry run
            onTrue: (): Effect.Effect<void> =>
              Effect.gen(function* () {
                logger.info(`Dry run - would create backup at: ${resolvedOutputPath}`);
                logger.info("Files to include:");
                yield* Effect.forEach(
                  fileNames,
                  (file) => Effect.sync(() => logger.info(`  - ${file}`)),
                  { discard: true }
                );
              }),
            onFalse: (): Effect.Effect<void, SystemError | GeneralError> =>
              Effect.gen(function* () {
                // Step 5: Warn about sensitive content
                logger.warn("WARNING: This backup contains encryption keys and secrets.");
                logger.warn(
                  "Treat this file like a password - store it securely and do not share it."
                );

                // Step 6: Create archive with metadata
                const metadata: ArchiveMetadata = {
                  schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
                  producer: DIVBAN_PRODUCER_NAME,
                  producerVersion: DIVBAN_VERSION,
                  service: svcName,
                  timestamp: new Date().toISOString(),
                  files: fileNames,
                };

                logger.info("Creating archive...");
                const archiveData = yield* createArchive(files, { compress: "gzip", metadata });

                // Step 7: Write archive to disk
                yield* writeBytes(resolvedOutputPath, archiveData);

                // Step 8: Output result
                yield* pipe(
                  Match.value(format),
                  Match.when("json", () =>
                    Effect.sync(() =>
                      logger.raw(
                        JSON.stringify({
                          path: resolvedOutputPath,
                          size: archiveData.length,
                          files: fileNames,
                          timestamp: metadata.timestamp,
                        })
                      )
                    )
                  ),
                  Match.when("pretty", () =>
                    Effect.sync(() => {
                      logger.success(`Configuration backup created: ${resolvedOutputPath}`);
                      logger.info(`  Size: ${formatBytes(archiveData.length)}`);
                      logger.info(`  Files: ${fileNames.length}`);
                    })
                  ),
                  Match.exhaustive
                );
              }),
          });
        }),
    });
  });
