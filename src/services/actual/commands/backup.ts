// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Actual Budget backup command.
 * Uses Bun.Archive for native tar operations - no external tar commands.
 */

import { Glob } from "bun";
import { formatBytes } from "../../../cli/commands/utils";
import {
  createBackupMetadata,
  createBackupTimestamp,
  ensureBackupDirectory,
  listBackupFiles,
  validateBackupService,
  writeBackupArchive,
} from "../../../lib/backup-utils";
import { DivbanError, ErrorCode } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import { isSome } from "../../../lib/option";
import { Err, Ok, type Result } from "../../../lib/result";
import { type AbsolutePath, type UserId, type Username, pathJoin } from "../../../lib/types";
import { extractArchive, readArchiveMetadata } from "../../../system/archive";
import { directoryExists, ensureDirectory } from "../../../system/fs";

export interface BackupOptions {
  /** Data directory containing Actual files */
  dataDir: AbsolutePath;
  /** Service user */
  user: Username;
  /** Service user UID */
  uid: UserId;
  /** Logger instance */
  logger: Logger;
}

/**
 * Create a backup of the Actual data directory.
 * Creates a compressed tar archive using Bun.Archive.
 */
export const backupActual = async (
  options: BackupOptions
): Promise<Result<AbsolutePath, DivbanError>> => {
  const { dataDir, logger } = options;

  // Check data directory exists
  if (!(await directoryExists(dataDir))) {
    return Err(new DivbanError(ErrorCode.BACKUP_FAILED, `Data directory not found: ${dataDir}`));
  }

  const timestamp = createBackupTimestamp();
  const backupFilename = `actual-backup-${timestamp}.tar.gz`;
  const backupsDir = pathJoin(dataDir, "backups");
  const backupPath = pathJoin(backupsDir, backupFilename);

  logger.info(`Creating backup: ${backupFilename}`);

  // Ensure backup directory exists
  const mkdirResult = await ensureBackupDirectory(backupsDir);
  if (!mkdirResult.ok) {
    return mkdirResult;
  }

  // Collect files to archive using Bun.Glob
  const glob = new Glob("**/*");
  const files: Record<string, Uint8Array> = {};
  const fileList: string[] = [];

  for await (const path of glob.scan({ cwd: dataDir, onlyFiles: true })) {
    // Exclude the backups directory itself to avoid recursion
    if (path.startsWith("backups/") || path === "backups") {
      continue;
    }

    const fullPath = `${dataDir}/${path}`;
    const content = await Bun.file(fullPath).bytes();
    files[path] = content;
    fileList.push(path);
  }

  // Create metadata and archive
  const metadata = createBackupMetadata("actual", fileList);

  const archiveResult = await writeBackupArchive(backupPath, files, {
    compress: "gzip",
    metadata,
  });
  if (!archiveResult.ok) {
    return archiveResult;
  }

  // Get backup size using stat for accuracy
  const stat = await Bun.file(backupPath).stat();
  const size = stat?.size ?? 0;

  logger.success(`Backup created: ${backupPath} (${formatBytes(size)})`);
  return Ok(backupPath);
};

/**
 * List available backups.
 * Re-exported from backup-utils for service-specific usage.
 */
export const listBackups = (dataDir: AbsolutePath): Promise<Result<string[], DivbanError>> =>
  listBackupFiles(pathJoin(dataDir, "backups"), "*.tar.gz");

/**
 * Restore from a backup archive.
 * Uses Bun.Archive for extraction - no subprocess tar needed.
 */
export const restoreActual = async (
  backupPath: AbsolutePath,
  dataDir: AbsolutePath,
  _user: Username,
  _uid: UserId,
  logger: Logger
): Promise<Result<void, DivbanError>> => {
  // Check backup file exists
  const file = Bun.file(backupPath);
  if (!(await file.exists())) {
    return Err(new DivbanError(ErrorCode.BACKUP_NOT_FOUND, `Backup file not found: ${backupPath}`));
  }

  logger.info(`Restoring from: ${backupPath}`);
  logger.warn("This will overwrite existing data!");

  try {
    // Read and decompress archive
    const compressedData = await file.bytes();

    // Read and validate metadata
    const metadata = await readArchiveMetadata(compressedData, { decompress: "gzip" });
    const validationResult = validateBackupService(metadata, "actual", logger);
    if (!validationResult.ok) {
      return validationResult;
    }

    if (isSome(metadata)) {
      logger.info(`Files in backup: ${metadata.value.files.length}`);
    }

    // Extract archive
    const files = await extractArchive(compressedData, { decompress: "gzip" });

    // Write files to data directory
    for (const [name, content] of files) {
      // Skip metadata.json
      if (name === "metadata.json") {
        continue;
      }

      // Validate filename doesn't contain path traversal
      if (name.includes("..") || name.startsWith("/") || name.includes("\x00")) {
        return Err(
          new DivbanError(
            ErrorCode.RESTORE_FAILED,
            `Invalid filename in backup archive: ${name}. Potential path traversal detected.`
          )
        );
      }

      const fullPath = `${dataDir}/${name}`;

      // Ensure parent directory exists
      const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      if (parentDir && parentDir !== dataDir) {
        await ensureDirectory(parentDir as AbsolutePath);
      }

      await Bun.write(fullPath, content);
    }
  } catch (e) {
    return Err(new DivbanError(ErrorCode.RESTORE_FAILED, `Failed to extract backup archive: ${e}`));
  }

  logger.success("Restore completed successfully");
  return Ok(undefined);
};
