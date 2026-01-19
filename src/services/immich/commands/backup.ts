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

import { Glob } from "bun";
import { formatBytes } from "../../../cli/commands/utils";
import { DivbanError, ErrorCode } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import { Err, Ok, type Result, mapErr } from "../../../lib/result";
import { type AbsolutePath, type UserId, type Username, pathJoin } from "../../../lib/types";
import { type ArchiveMetadata, createArchive } from "../../../system/archive";
import { execAsUser } from "../../../system/exec";
import { directoryExists, ensureDirectory } from "../../../system/fs";

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
    containerName = "immich-postgres",
    dbUser = "immich",
    compression = "zstd",
  } = options;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = getCompressionExtension(compression);
  const backupFilename = `immich-db-backup-${timestamp}.tar${ext}`;
  const backupDir = pathJoin(dataDir, "backups");
  const backupPath = pathJoin(backupDir, backupFilename);

  logger.info(`Creating database backup: ${backupFilename}`);

  // Ensure backup directory exists using native fs
  const mkdirResult = await ensureDirectory(backupDir);
  const mkdirMapped = mapErr(
    mkdirResult,
    (err) =>
      new DivbanError(
        ErrorCode.BACKUP_FAILED,
        `Failed to create backup directory: ${err.message}`,
        err
      )
  );
  if (!mkdirMapped.ok) {
    return mkdirMapped;
  }

  // Run pg_dumpall inside the postgres container
  const dumpResult = await execAsUser(
    user,
    uid,
    ["podman", "exec", containerName, "pg_dumpall", "-U", dbUser, "--clean", "--if-exists"],
    {
      captureStdout: true,
      captureStderr: true,
    }
  );

  if (!dumpResult.ok || dumpResult.value.exitCode !== 0) {
    const stderr = dumpResult.ok ? dumpResult.value.stderr : "";
    return Err(new DivbanError(ErrorCode.BACKUP_FAILED, `Database dump failed: ${stderr}`));
  }

  // Create metadata
  const metadata: ArchiveMetadata = {
    version: "1.0",
    service: "immich",
    timestamp: new Date().toISOString(),
    files: ["database.sql"],
  };

  // Create archive with SQL dump and metadata
  const files: Record<string, string | Uint8Array> = {
    "database.sql": dumpResult.value.stdout,
  };

  try {
    const archiveData = await createArchive(files, {
      compress: compression,
      metadata,
    });

    // Write archive to disk
    await Bun.write(backupPath, archiveData);
  } catch (e) {
    return Err(new DivbanError(ErrorCode.BACKUP_FAILED, `Failed to create backup archive: ${e}`));
  }

  const file = Bun.file(backupPath);
  const size = file.size;

  logger.success(`Backup created: ${backupPath} (${formatBytes(size)})`);
  return Ok(backupPath);
};

/**
 * List available backups.
 * Uses Bun.Glob for native file discovery - no subprocess needed.
 * Finds both gzip (.tar.gz) and zstd (.tar.zst) compressed backups.
 */
export const listBackups = async (
  dataDir: AbsolutePath
): Promise<Result<string[], DivbanError>> => {
  const backupDir = `${dataDir}/backups`;

  if (!(await directoryExists(backupDir as AbsolutePath))) {
    return Ok([]);
  }

  // Match both gzip and zstd compressed tar archives
  const glob = new Glob("*.tar.{gz,zst}");
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
