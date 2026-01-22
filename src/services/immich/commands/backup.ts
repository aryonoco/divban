// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Immich database backup command.
 */

import { Effect } from "effect";
import { formatBytes } from "../../../cli/commands/utils";
import { DEFAULT_TIMEOUTS } from "../../../config/schema";
import { createBackupTimestamp, listFilesByMtime } from "../../../lib/backup-utils";
import { BackupError, ErrorCode, type GeneralError, type SystemError } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import {
  type AbsolutePath,
  type GroupId,
  type UserId,
  type Username,
  pathJoin,
} from "../../../lib/types";
import type { ArchiveMetadata } from "../../../system/archive";
import { createArchive } from "../../../system/archive";
import { ensureDirectory } from "../../../system/directories";
import { execAsUser } from "../../../system/exec";
import { directoryExists, writeBytes } from "../../../system/fs";
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

/**
 * Create archive metadata for a backup.
 */
const createBackupMetadata = (service: string, files: string[]): ArchiveMetadata => ({
  version: "1.0",
  service,
  timestamp: new Date().toISOString(),
  files,
});

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
export const backupDatabase = (
  options: BackupOptions
): Effect.Effect<AbsolutePath, BackupError | SystemError | GeneralError> =>
  Effect.gen(function* () {
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
    yield* ensureDirectory(backupDir, { uid, gid: uid as unknown as GroupId });

    // Run pg_dumpall inside the postgres container
    const dumpResult = yield* execAsUser(
      user,
      uid,
      ["podman", "exec", containerName, "pg_dumpall", "-U", dbUser, "--clean", "--if-exists"],
      {
        timeout: DEFAULT_TIMEOUTS.backup,
        captureStdout: true,
        captureStderr: true,
      }
    );

    if (dumpResult.exitCode !== 0) {
      return yield* Effect.fail(
        new BackupError({
          code: ErrorCode.BACKUP_FAILED as 50,
          message: `Database dump failed: ${dumpResult.stderr}`,
        })
      );
    }

    // Create metadata and archive
    const metadata = createBackupMetadata("immich", ["database.sql"]);
    const files: Record<string, string | Uint8Array> = {
      "database.sql": dumpResult.stdout,
    };

    const archiveData = yield* createArchive(files, {
      compress: compression,
      metadata,
    });

    yield* writeBytes(backupPath, archiveData);

    // Get backup size using stat for accuracy
    const stat = yield* Effect.promise(() => Bun.file(backupPath).stat());
    const size = stat?.size ?? 0;

    logger.success(`Backup created: ${backupPath} (${formatBytes(size)})`);
    return backupPath;
  });

/**
 * List available backups.
 */
export const listBackups = (
  dataDir: AbsolutePath,
  pattern = "*.tar.{gz,zst}"
): Effect.Effect<string[], never> =>
  Effect.gen(function* () {
    const backupDir = pathJoin(dataDir, "backups");

    const exists = yield* directoryExists(backupDir);
    if (!exists) {
      return [];
    }

    // Use shared utility - returns files sorted by mtime (newest first)
    const files = yield* listFilesByMtime(backupDir, pattern);
    return [...files]; // Convert readonly to mutable for return type compatibility
  });
