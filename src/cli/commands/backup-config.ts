// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Backup-config command - create a backup of configuration files.
 * Uses fs.ts wrappers for idiomatic Result-based error handling,
 * and Bun APIs directly where wrappers don't exist.
 */

import { Glob } from "bun";
import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode, wrapError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { fromUndefined, mapOption, transpose } from "../../lib/option";
import { userConfigDir } from "../../lib/paths";
import {
  Err,
  Ok,
  type Result,
  asyncFlatMapResult,
  mapErr,
  mapResult,
  parallel,
  tryCatch,
} from "../../lib/result";
import type { AbsolutePath, ServiceName } from "../../lib/types";
import { pathJoin } from "../../lib/types";
import type { AnyService } from "../../services/types";
import { type ArchiveMetadata, createArchive } from "../../system/archive";
import { directoryExists, ensureDirectory, fileExists } from "../../system/fs";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { formatBytes, toAbsolute } from "./utils";

export interface BackupConfigOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/** File entry: archive path and content */
type FileEntry = readonly [string, Uint8Array];

// ============================================================================
// Binary I/O Helpers - Bun APIs with Result wrapping
// (fs.ts only provides text-based read/write, we need binary)
// ============================================================================

/**
 * Safely read file bytes using Bun.file().bytes().
 * Wraps potential errors in Result for idiomatic error handling.
 */
const readBytes = (path: AbsolutePath): Promise<Result<Uint8Array, DivbanError>> =>
  tryCatch(
    () => Bun.file(path).bytes(),
    (e) => wrapError(e, ErrorCode.FILE_READ_FAILED, `Failed to read file: ${path}`)
  );

/**
 * Write bytes to disk using Bun.write().
 * Uses kernel-level optimizations (copy_file_range on Linux, clonefile on macOS).
 */
const writeBytes = (path: AbsolutePath, data: Uint8Array): Promise<Result<void, DivbanError>> =>
  tryCatch(
    async () => {
      await Bun.write(path, data);
    },
    (e) => wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to write file: ${path}`)
  );

// ============================================================================
// File Collection - Parallel I/O with Result aggregation
// ============================================================================

/**
 * Read a file if it exists, returning the entry or null.
 * Uses fs.ts fileExists for consistency with codebase patterns.
 */
const readFileIfExists = async (
  path: AbsolutePath,
  archiveName: string
): Promise<Result<FileEntry | null, DivbanError>> => {
  if (!(await fileExists(path))) {
    return Ok(null);
  }
  return mapResult(await readBytes(path), (bytes) => [archiveName, bytes] as const);
};

/**
 * Collect config files for a single service.
 * Reads all candidate files in parallel with Result collection.
 */
const collectServiceConfigFiles = async (
  configDir: AbsolutePath,
  serviceName: string
): Promise<Result<Record<string, Uint8Array>, DivbanError>> => {
  const candidates = [
    [pathJoin(configDir, `${serviceName}.toml`), `${serviceName}.toml`],
    [pathJoin(configDir, ".age", `${serviceName}.key`), `.age/${serviceName}.key`],
    [pathJoin(configDir, `${serviceName}.secrets.age`), `${serviceName}.secrets.age`],
  ] as const;

  // Parallel reads with Result collection - handles both errors and rejections
  const result = await parallel(
    candidates.map(([path, name]) => readFileIfExists(path, name)),
    (e) => wrapError(e, ErrorCode.FILE_READ_FAILED, "Failed to read config file")
  );

  return mapResult(result, (entries) =>
    Object.fromEntries(entries.filter((entry): entry is FileEntry => entry !== null))
  );
};

/**
 * Read a file and return as a FileEntry.
 */
const readFileAsEntry = async (
  filePath: AbsolutePath,
  archiveName: string
): Promise<Result<FileEntry, DivbanError>> =>
  mapResult(await readBytes(filePath), (bytes) => [archiveName, bytes] as const);

/**
 * Scan directory with glob pattern, reading all matching files.
 * Uses Bun.Glob.scan() for fast native file discovery.
 */
const scanAndReadFiles = async (
  baseDir: AbsolutePath,
  pattern: string,
  archivePrefix = ""
): Promise<Result<FileEntry[], DivbanError>> => {
  const glob = new Glob(pattern);
  const readPromises: Promise<Result<FileEntry, DivbanError>>[] = [];

  // Collect all file paths first, then read in parallel
  for await (const file of glob.scan({ cwd: baseDir, onlyFiles: true })) {
    const filePath = pathJoin(baseDir, file);
    const archiveName = archivePrefix ? `${archivePrefix}${file}` : file;
    readPromises.push(readFileAsEntry(filePath, archiveName));
  }

  return parallel(readPromises, (e) =>
    wrapError(e, ErrorCode.FILE_READ_FAILED, `Failed to scan ${baseDir}`)
  );
};

/**
 * Collect all config files (for "all" service).
 * Scans multiple patterns in parallel for TOML, age keys, and secrets.
 * Uses fs.ts directoryExists for consistency.
 */
const collectAllConfigFiles = async (
  configDir: AbsolutePath
): Promise<Result<Record<string, Uint8Array>, DivbanError>> => {
  const ageDir = pathJoin(configDir, ".age");
  const hasAgeDir = await directoryExists(ageDir);

  // Parallel scans across different patterns - handles both errors and rejections
  const scanResults = await parallel(
    [
      scanAndReadFiles(configDir, "*.toml"),
      scanAndReadFiles(configDir, "*.secrets.age"),
      hasAgeDir
        ? scanAndReadFiles(ageDir, "*.key", ".age/")
        : Promise.resolve(Ok([] as FileEntry[])),
    ],
    (e) => wrapError(e, ErrorCode.FILE_READ_FAILED, "Failed to scan config files")
  );

  // Combine all file entries if successful
  return mapResult(scanResults, (results) => Object.fromEntries(results.flat()));
};

// ============================================================================
// Config Directory Resolution
// ============================================================================

/**
 * Get config directory for a service by looking up its system user.
 * Uses asyncFlatMapResult for clean async chaining.
 * Uses fs.ts directoryExists for consistency.
 */
const getServiceConfigDir = async (
  serviceName: ServiceName
): Promise<Result<AbsolutePath, DivbanError>> => {
  const usernameResult = getServiceUsername(serviceName);
  if (!usernameResult.ok) {
    return usernameResult;
  }

  return asyncFlatMapResult(
    mapErr(
      await getUserByName(usernameResult.value),
      () => new DivbanError(ErrorCode.SERVICE_NOT_FOUND, `Service '${serviceName}' not set up`)
    ),
    async (user) => {
      const configDir = userConfigDir(user.homeDir);
      return (await directoryExists(configDir))
        ? Ok(configDir)
        : Err(
            new DivbanError(
              ErrorCode.SERVICE_NOT_FOUND,
              `Config directory not found for ${serviceName}`
            )
          );
    }
  );
};

/**
 * Find first valid config directory from known services.
 * Tries each sequentially until one succeeds.
 */
const findConfigDir = async (): Promise<Result<AbsolutePath, DivbanError>> => {
  const knownServices: ServiceName[] = [
    "immich" as ServiceName,
    "caddy" as ServiceName,
    "actual" as ServiceName,
  ];

  for (const svc of knownServices) {
    const result = await getServiceConfigDir(svc);
    if (result.ok) {
      return result;
    }
  }

  return Err(
    new DivbanError(
      ErrorCode.SERVICE_NOT_FOUND,
      "No configured services found. Run 'divban <service> setup' first."
    )
  );
};

/**
 * Resolve config directory based on service (single or "all").
 */
const resolveConfigDir = (serviceName: string): Promise<Result<AbsolutePath, DivbanError>> =>
  serviceName === "all" ? findConfigDir() : getServiceConfigDir(serviceName as ServiceName);

// ============================================================================
// Output Path Preparation
// ============================================================================

/**
 * Build archive output path and ensure directory exists.
 * Uses Option pattern for handling optional custom path.
 * Uses fs.ts ensureDirectory for Result-based error handling.
 */
const prepareOutputPath = async (
  configDir: AbsolutePath,
  serviceName: string,
  customPath: string | undefined
): Promise<Result<AbsolutePath, DivbanError>> => {
  // Option pattern: validate custom path if provided, using transpose for Option<Result> → Result<Option>
  const customOpt = fromUndefined(customPath);
  const validatedOpt = transpose(mapOption(customOpt, toAbsolute));

  // If validation failed, return the error
  if (!validatedOpt.ok) {
    return validatedOpt;
  }

  // If custom path was provided and valid, use it
  if (validatedOpt.value.isSome) {
    return Ok(validatedOpt.value.value);
  }

  // Generate timestamped default path
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `config-backup-${serviceName}-${timestamp}.tar.gz`;
  const backupDir = pathJoin(configDir, "backups");

  return mapResult(await ensureDirectory(backupDir), () => pathJoin(backupDir, filename));
};

// ============================================================================
// Main Command Execution
// ============================================================================

/**
 * Execute backup-config command.
 * Creates a compressed archive of configuration files for a service.
 */
export const executeBackupConfig = async (
  options: BackupConfigOptions
): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;
  const serviceName = service.definition.name;
  const isAll = serviceName === "all";

  // Step 1: Resolve config directory
  const configDirResult = await resolveConfigDir(serviceName);
  if (!configDirResult.ok) {
    return configDirResult;
  }
  const configDir = configDirResult.value;

  // Step 2: Collect files (parallel I/O)
  logger.info("Collecting configuration files...");
  const filesResult = isAll
    ? await collectAllConfigFiles(configDir)
    : await collectServiceConfigFiles(configDir, serviceName);

  if (!filesResult.ok) {
    return filesResult;
  }
  const files = filesResult.value;

  const fileNames = Object.keys(files);
  if (fileNames.length === 0) {
    return Err(
      new DivbanError(ErrorCode.GENERAL_ERROR, `No configuration files found for ${serviceName}`)
    );
  }

  // Step 3: Prepare output path
  const outputPathResult = await prepareOutputPath(configDir, serviceName, args.configPath);
  if (!outputPathResult.ok) {
    return outputPathResult;
  }
  const outputPath = outputPathResult.value;

  // Step 4: Handle dry run
  if (args.dryRun) {
    logger.info(`Dry run - would create backup at: ${outputPath}`);
    logger.info("Files to include:");
    for (const file of fileNames) {
      logger.info(`  - ${file}`);
    }
    return Ok(undefined);
  }

  // Step 5: Warn about sensitive content
  logger.warn("WARNING: This backup contains encryption keys and secrets.");
  logger.warn("Treat this file like a password - store it securely and do not share it.");

  // Step 6: Create archive with metadata
  const metadata: ArchiveMetadata = {
    version: "1.0",
    service: serviceName,
    timestamp: new Date().toISOString(),
    files: fileNames,
  };

  logger.info("Creating archive...");
  const archiveData = await createArchive(files, { compress: "gzip", metadata });

  // Step 7: Write archive to disk
  const writeResult = await writeBytes(outputPath, archiveData);
  if (!writeResult.ok) {
    return writeResult;
  }

  // Step 8: Output result
  if (args.format === "json") {
    logger.raw(
      JSON.stringify({
        path: outputPath,
        size: archiveData.length,
        files: fileNames,
        timestamp: metadata.timestamp,
      })
    );
  } else {
    logger.success(`Configuration backup created: ${outputPath}`);
    logger.info(`  Size: ${formatBytes(archiveData.length)}`);
    logger.info(`  Files: ${fileNames.length}`);
  }

  return Ok(undefined);
};
