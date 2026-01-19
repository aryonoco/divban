// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Immich database backup command.
 * Uses Bun.Archive for native tar operations with metadata support.
 */

import { formatBytes } from "../../../cli/commands/utils";
import { DEFAULT_TIMEOUTS } from "../../../config/schema";
import {
  createBackupMetadata,
  createBackupTimestamp,
  ensureBackupDirectory,
  listBackupFiles,
  writeBackupArchive,
} from "../../../lib/backup-utils";
import { DivbanError, ErrorCode } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import { Err, Ok, type Result } from "../../../lib/result";
import { type AbsolutePath, type UserId, type Username, pathJoin } from "../../../lib/types";
import { execAsUser } from "../../../system/exec";
import { CONTAINERS } from "../constants";

/**
 * Compression method for backups.
 * - zstd: Zstandard compression (3-5x faster, better ratio) - default
 * - gzip: Standard gzip compression (good compatibility)
 */
export type CompressionMethod = "zstd" | "gzip";

/**
 * Get file extension for the compression method.
 */
const getCompressionExtension = (method: CompressionMethod): string => {
  return method === "zstd" ? ".zst" : ".gz";
};

export interface BackupOptions {
  /** Data directory */
  dataDir: AbsolutePath;
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
  /** Compression method (default: zstd) */
  compression?: CompressionMethod;
}

/**
 * Create a PostgreSQL database backup.
 * Uses Bun.Archive to create a tar archive containing SQL dump and metadata.
 */
export const backupDatabase = async (
  options: BackupOptions
): Promise<Result<AbsolutePath, DivbanError>> => {
  const {
    dataDir,
    user,
    uid,
    logger,
    containerName = CONTAINERS.postgres,
    dbUser = "immich",
    compression = "zstd",
  } = options;

  const timestamp = createBackupTimestamp();
  const ext = getCompressionExtension(compression);
  const backupFilename = `immich-db-backup-${timestamp}.tar${ext}`;
  const backupDir = pathJoin(dataDir, "backups");
  const backupPath = pathJoin(backupDir, backupFilename);

  logger.info(`Creating database backup: ${backupFilename}`);

  // Ensure backup directory exists
  const mkdirResult = await ensureBackupDirectory(backupDir);
  if (!mkdirResult.ok) {
    return mkdirResult;
  }

  // Run pg_dumpall inside the postgres container
  const dumpResult = await execAsUser(
    user,
    uid,
    ["podman", "exec", containerName, "pg_dumpall", "-U", dbUser, "--clean", "--if-exists"],
    {
      timeout: DEFAULT_TIMEOUTS.backup,
      captureStdout: true,
      captureStderr: true,
    }
  );

  if (!dumpResult.ok || dumpResult.value.exitCode !== 0) {
    const stderr = dumpResult.ok ? dumpResult.value.stderr : "";
    return Err(new DivbanError(ErrorCode.BACKUP_FAILED, `Database dump failed: ${stderr}`));
  }

  // Create metadata and archive
  const metadata = createBackupMetadata("immich", ["database.sql"]);
  const files: Record<string, string | Uint8Array> = {
    "database.sql": dumpResult.value.stdout,
  };

  const archiveResult = await writeBackupArchive(backupPath, files, {
    compress: compression,
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
  listBackupFiles(pathJoin(dataDir, "backups"));
