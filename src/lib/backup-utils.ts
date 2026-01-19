// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Shared backup utilities for all services.
 * Provides common functionality for creating, listing, and validating backups.
 */

import { Glob } from "bun";
import type { ArchiveMetadata } from "../system/archive";
import { createArchive } from "../system/archive";
import { directoryExists, ensureDirectory } from "../system/fs";
import { DivbanError, ErrorCode } from "./errors";
import type { Logger } from "./logger";
import { None, type Option, Some, isNone } from "./option";
import { Err, Ok, type Result, mapErr, tryCatch } from "./result";
import type { AbsolutePath } from "./types";

/**
 * Create a backup-safe timestamp string.
 * Format: YYYY-MM-DDTHH-mm-ss-sssZ (ISO with colons/periods replaced)
 */
export const createBackupTimestamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");

/**
 * Ensure backup directory exists with proper error mapping.
 */
export const ensureBackupDirectory = async (
  backupDir: AbsolutePath
): Promise<Result<void, DivbanError>> =>
  mapErr(
    await ensureDirectory(backupDir),
    (err) =>
      new DivbanError(
        ErrorCode.BACKUP_FAILED,
        `Failed to create backup directory: ${err.message}`,
        err
      )
  );

/**
 * Create archive metadata for a backup.
 */
export const createBackupMetadata = (service: string, files: string[]): ArchiveMetadata => ({
  version: "1.0",
  service,
  timestamp: new Date().toISOString(),
  files,
});

/**
 * Write a backup archive to disk.
 * Returns the path on success.
 *
 * Uses tryCatch for exception-safe async operations.
 */
export const writeBackupArchive = (
  backupPath: AbsolutePath,
  files: Record<string, string | Uint8Array | Blob>,
  options: { compress: "gzip" | "zstd"; metadata: ArchiveMetadata }
): Promise<Result<void, DivbanError>> =>
  tryCatch(
    async () => {
      const archiveData = await createArchive(files, {
        compress: options.compress,
        metadata: options.metadata,
      });
      await Bun.write(backupPath, archiveData);
    },
    (e) => new DivbanError(ErrorCode.BACKUP_FAILED, `Failed to create backup archive: ${e}`)
  );

/**
 * List backup files in a directory, sorted by modification time (newest first).
 * @param backupDir - Directory containing backups
 * @param pattern - Glob pattern (default: "*.tar.{gz,zst}" for both formats)
 */
export const listBackupFiles = async (
  backupDir: AbsolutePath,
  pattern = "*.tar.{gz,zst}"
): Promise<Result<string[], DivbanError>> => {
  if (!(await directoryExists(backupDir))) {
    return Ok([]);
  }

  const glob = new Glob(pattern);
  const files: string[] = [];

  for await (const file of glob.scan({ cwd: backupDir, onlyFiles: true })) {
    files.push(file);
  }

  // Sort by modification time (newest first)
  const withStats = await Promise.all(
    files.map(async (f) => ({
      name: f,
      mtime: (await Bun.file(`${backupDir}/${f}`).stat())?.mtimeMs ?? 0,
    }))
  );

  withStats.sort((a, b) => b.mtime - a.mtime);
  return Ok(withStats.map((f) => f.name));
};

/**
 * Detect compression format from file extension.
 */
export const detectCompressionFormat = (path: string): Option<"gzip" | "zstd"> => {
  if (path.endsWith(".tar.gz") || path.endsWith(".gz")) {
    return Some("gzip");
  }
  if (path.endsWith(".tar.zst") || path.endsWith(".zst")) {
    return Some("zstd");
  }
  return None;
};

/**
 * Validate backup file exists before restore.
 */
export const validateBackupExists = async (
  backupPath: AbsolutePath
): Promise<Result<void, DivbanError>> => {
  const file = Bun.file(backupPath);
  if (!(await file.exists())) {
    return Err(new DivbanError(ErrorCode.BACKUP_NOT_FOUND, `Backup file not found: ${backupPath}`));
  }
  return Ok(undefined);
};

/**
 * Get accurate file size using stat() instead of lazy .size property.
 */
export const getBackupFileSize = async (backupPath: AbsolutePath): Promise<number> => {
  const stat = await Bun.file(backupPath).stat();
  return stat?.size ?? 0;
};

/**
 * Validate backup metadata matches expected service.
 * Returns Ok if metadata is missing (backwards compat) or service matches.
 * Uses Option → Result pattern: None → Ok, Some with mismatch → Err.
 */
export const validateBackupService = (
  metadata: Option<ArchiveMetadata>,
  expectedService: string,
  logger: Logger
): Result<void, DivbanError> => {
  if (isNone(metadata)) {
    return Ok(undefined); // No metadata = legacy backup, allow
  }

  const { service, timestamp } = metadata.value;

  if (service !== expectedService) {
    return Err(
      new DivbanError(
        ErrorCode.RESTORE_FAILED,
        `Backup is for service '${service}', not '${expectedService}'. Use the correct restore command.`
      )
    );
  }

  logger.info(`Backup from: ${timestamp}, service: ${service}`);
  return Ok(undefined);
};
