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
import { Effect, Either, Match, Option, pipe } from "effect";
import { getServiceUsername } from "../../config/schema";
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
import type { AbsolutePath, ServiceName } from "../../lib/types";
import { pathJoin } from "../../lib/types";
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
import type { ParsedArgs } from "../parser";
import { formatBytes } from "./utils";

export interface BackupConfigOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

/** File entry: archive path and content */
type FileEntry = readonly [string, Uint8Array];

// ============================================================================
// File Collection - Parallel I/O with Effect
// ============================================================================

/**
 * Read a file if it exists, returning the entry or null.
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
 * Collect config files for a single service.
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

/**
 * Read a file and return as a FileEntry.
 */
const readFileAsEntry = (
  filePath: AbsolutePath,
  archiveName: string
): Effect.Effect<FileEntry, SystemError | GeneralError> =>
  Effect.map(readBytes(filePath), (bytes) => [archiveName, bytes] as const);

/**
 * Scan directory with glob pattern, reading all matching files.
 */
const scanAndReadFiles = (
  baseDir: AbsolutePath,
  pattern: string,
  archivePrefix = ""
): Effect.Effect<FileEntry[], SystemError | GeneralError> =>
  Effect.gen(function* () {
    const glob = new Glob(pattern);
    const files = yield* collectAsyncOrDie(glob.scan({ cwd: baseDir, onlyFiles: true }));

    // Read all files in parallel
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
 * Collect all config files (for "all" service).
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
 * Get config directory for a service by looking up its system user.
 */
const getServiceConfigDir = (
  serviceName: ServiceName
): Effect.Effect<AbsolutePath, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const username = yield* getServiceUsername(serviceName);
    const userResult = yield* Effect.either(getUserByName(username));

    type ResultType = Effect.Effect<AbsolutePath, ServiceError | SystemError | GeneralError>;
    return yield* Either.match(userResult, {
      onLeft: (): ResultType =>
        Effect.fail(
          new ServiceError({
            code: ErrorCode.SERVICE_NOT_FOUND as 30,
            message: `Service '${serviceName}' not set up`,
            service: serviceName,
          })
        ),
      onRight: ({ homeDir }): ResultType =>
        Effect.gen(function* () {
          const configDir = userConfigDir(homeDir);
          const exists = yield* directoryExists(configDir);

          return yield* pipe(
            Match.value(exists),
            Match.when(false, () =>
              Effect.fail(
                new ServiceError({
                  code: ErrorCode.SERVICE_NOT_FOUND as 30,
                  message: `Config directory not found for ${serviceName}`,
                  service: serviceName,
                })
              )
            ),
            Match.when(true, () => Effect.succeed(configDir)),
            Match.exhaustive
          );
        }),
    });
  });

/**
 * Find first valid config directory from known services.
 */
const findConfigDir = (): Effect.Effect<
  AbsolutePath,
  ServiceError | SystemError | GeneralError
> => {
  const knownServices: ServiceName[] = [
    "immich" as ServiceName,
    "caddy" as ServiceName,
    "actual" as ServiceName,
  ];

  return pipe(
    Effect.firstSuccessOf(knownServices.map((svc) => getServiceConfigDir(svc))),
    Effect.catchAll(() =>
      Effect.fail(
        new ServiceError({
          code: ErrorCode.SERVICE_NOT_FOUND as 30,
          message: "No configured services found. Run 'divban <service> setup' first.",
          service: "all",
        })
      )
    )
  );
};

/**
 * Resolve config directory based on service (single or "all").
 */
const resolveConfigDir = (
  serviceName: ServiceName | "all"
): Effect.Effect<AbsolutePath, ServiceError | SystemError | GeneralError | ConfigError> =>
  serviceName === "all" ? findConfigDir() : getServiceConfigDir(serviceName);

// ============================================================================
// Output Path Preparation
// ============================================================================

/**
 * Build archive output path and ensure directory exists.
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
        // Generate timestamped default path
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

/**
 * Execute backup-config command.
 */
export const executeBackupConfig = (
  options: BackupConfigOptions
): Effect.Effect<void, GeneralError | ServiceError | SystemError | ConfigError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const serviceName = service.definition.name;
    const isAll = serviceName === "all";

    // Step 1: Resolve config directory
    const configDir = yield* resolveConfigDir(serviceName);

    // Step 2: Collect files (parallel I/O)
    logger.info("Collecting configuration files...");
    const files = yield* pipe(
      Match.value(isAll),
      Match.when(true, () => collectAllConfigFiles(configDir)),
      Match.when(false, () => collectServiceConfigFiles(configDir, serviceName)),
      Match.exhaustive
    );

    const fileNames = Object.keys(files);

    return yield* pipe(
      Match.value(fileNames.length === 0),
      Match.when(true, () =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `No configuration files found for ${serviceName}`,
          })
        )
      ),
      Match.when(false, () =>
        Effect.gen(function* () {
          // Step 3: Prepare output path
          const outputPath = yield* prepareOutputPath(configDir, serviceName, args.configPath);

          return yield* pipe(
            Match.value(args.dryRun),
            // Step 4: Handle dry run
            Match.when(true, () =>
              Effect.gen(function* () {
                logger.info(`Dry run - would create backup at: ${outputPath}`);
                logger.info("Files to include:");
                yield* Effect.forEach(
                  fileNames,
                  (file) => Effect.sync(() => logger.info(`  - ${file}`)),
                  { discard: true }
                );
              })
            ),
            Match.when(false, () =>
              Effect.gen(function* () {
                // Step 5: Warn about sensitive content
                logger.warn("WARNING: This backup contains encryption keys and secrets.");
                logger.warn(
                  "Treat this file like a password - store it securely and do not share it."
                );

                // Step 6: Create archive with metadata
                const metadata: ArchiveMetadata = {
                  version: "1.0",
                  service: serviceName,
                  timestamp: new Date().toISOString(),
                  files: fileNames,
                };

                logger.info("Creating archive...");
                const archiveData = yield* createArchive(files, { compress: "gzip", metadata });

                // Step 7: Write archive to disk
                yield* writeBytes(outputPath, archiveData);

                // Step 8: Output result
                yield* pipe(
                  Match.value(args.format),
                  Match.when("json", () =>
                    Effect.sync(() =>
                      logger.raw(
                        JSON.stringify({
                          path: outputPath,
                          size: archiveData.length,
                          files: fileNames,
                          timestamp: metadata.timestamp,
                        })
                      )
                    )
                  ),
                  Match.when("pretty", () =>
                    Effect.sync(() => {
                      logger.success(`Configuration backup created: ${outputPath}`);
                      logger.info(`  Size: ${formatBytes(archiveData.length)}`);
                      logger.info(`  Files: ${fileNames.length}`);
                    })
                  ),
                  Match.exhaustive
                );
              })
            ),
            Match.orElse(() => Effect.void)
          );
        })
      ),
      Match.exhaustive
    );
  });
