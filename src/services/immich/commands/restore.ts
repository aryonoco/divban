// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Immich database restore command.
 * Uses Bun.Archive for extraction - no external gunzip/tar commands.
 */

import { detectCompressionFormat } from "../../../lib/backup-utils";
import { DivbanError, ErrorCode } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import { isNone, isSome } from "../../../lib/option";
import { Err, Ok, type Result } from "../../../lib/result";
import type { AbsolutePath, UserId, Username } from "../../../lib/types";
import { extractArchive, readArchiveMetadata } from "../../../system/archive";
import { execAsUser } from "../../../system/exec";
import { fileExists } from "../../../system/fs";
import { CONTAINERS } from "../constants";

export interface RestoreOptions {
  /** Path to backup file */
  backupPath: AbsolutePath;
  /** Service user */
  user: Username;
  /** Service user UID */
  uid: UserId;
  /** Logger instance */
  logger: Logger;
  /** Database container name */
  containerName?: string;
  /** Database name */
  database?: string;
  /** Database user */
  dbUser?: string;
}

/**
 * Restore a PostgreSQL database from backup.
 * Uses Bun.Archive for extraction - no subprocess gunzip needed.
 */
export const restoreDatabase = async (
  options: RestoreOptions
): Promise<Result<void, DivbanError>> => {
  const {
    backupPath,
    user,
    uid,
    logger,
    containerName = CONTAINERS.postgres,
    database = "immich",
    dbUser = "immich",
  } = options;

  // Check backup file exists
  if (!(await fileExists(backupPath))) {
    return Err(new DivbanError(ErrorCode.BACKUP_NOT_FOUND, `Backup file not found: ${backupPath}`));
  }

  logger.info(`Restoring database from: ${backupPath}`);
  logger.warn("This will overwrite the existing database!");

  // Detect compression type
  const compression = detectCompressionFormat(backupPath);
  if (isNone(compression)) {
    return Err(
      new DivbanError(
        ErrorCode.RESTORE_FAILED,
        `Unsupported backup format: ${backupPath}. Expected .tar.gz or .tar.zst`
      )
    );
  }

  // Read the backup file
  const file = Bun.file(backupPath);
  const compressedData = await file.bytes();

  // Read and validate metadata
  const metadata = await readArchiveMetadata(compressedData, { decompress: compression.value });
  if (isSome(metadata)) {
    logger.info(`Backup from: ${metadata.value.timestamp}, service: ${metadata.value.service}`);
  }

  // Extract archive
  let sqlData: string;
  try {
    const files = await extractArchive(compressedData, { decompress: compression.value });
    const sqlBytes = files.get("database.sql");

    if (!sqlBytes) {
      return Err(
        new DivbanError(ErrorCode.RESTORE_FAILED, "Backup archive does not contain database.sql")
      );
    }

    sqlData = new TextDecoder().decode(sqlBytes);
  } catch (e) {
    return Err(new DivbanError(ErrorCode.RESTORE_FAILED, `Failed to extract backup archive: ${e}`));
  }

  // Restore using psql
  const restoreResult = await execAsUser(
    user,
    uid,
    ["podman", "exec", "-i", containerName, "psql", "-U", dbUser, "-d", database],
    {
      stdin: sqlData,
      captureStdout: true,
      captureStderr: true,
    }
  );

  if (!restoreResult.ok) {
    return Err(
      new DivbanError(ErrorCode.RESTORE_FAILED, "Failed to restore database", restoreResult.error)
    );
  }

  if (restoreResult.value.exitCode !== 0) {
    // psql may return non-zero for warnings, check stderr
    const stderr = restoreResult.value.stderr;
    if (stderr.includes("ERROR")) {
      return Err(new DivbanError(ErrorCode.RESTORE_FAILED, `Database restore failed: ${stderr}`));
    }
    // Warnings are OK
    logger.warn(`Restore completed with warnings: ${stderr}`);
  }

  logger.success("Database restored successfully");
  return Ok(undefined);
};

/**
 * Validate a backup file.
 * Uses Bun's native decompression to validate.
 */
export const validateBackup = async (
  backupPath: AbsolutePath
): Promise<Result<void, DivbanError>> => {
  // Check file exists
  if (!(await fileExists(backupPath))) {
    return Err(new DivbanError(ErrorCode.BACKUP_NOT_FOUND, `Backup file not found: ${backupPath}`));
  }

  // Detect compression type
  const compression = detectCompressionFormat(backupPath);
  if (isNone(compression)) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Unsupported backup format: ${backupPath}. Expected .tar.gz or .tar.zst`
      )
    );
  }

  // Try to read and decompress the archive
  try {
    const file = Bun.file(backupPath);
    const compressedData = await file.bytes();

    // Attempt to extract - this validates both compression and tar format
    const files = await extractArchive(compressedData, { decompress: compression.value });

    // Check for database.sql
    if (!files.has("database.sql")) {
      return Err(
        new DivbanError(
          ErrorCode.GENERAL_ERROR,
          "Invalid backup file: missing database.sql in archive"
        )
      );
    }
  } catch (e) {
    return Err(
      new DivbanError(ErrorCode.GENERAL_ERROR, `Invalid backup file: decompression failed: ${e}`)
    );
  }

  return Ok(undefined);
};
