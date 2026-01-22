// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Actual Budget backup command.
 */

import { Effect, Option, pipe } from "effect";
import { formatBytes } from "../../../cli/commands/utils";
import {
  collectFilesWithContent,
  createBackupTimestamp,
  listFilesByMtime,
} from "../../../lib/backup-utils";
import { BackupError, ErrorCode, type GeneralError, SystemError } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import { type AbsolutePath, type UserId, type Username, pathJoin } from "../../../lib/types";
import type { ArchiveMetadata } from "../../../system/archive";
import { createArchive, extractArchive, readArchiveMetadata } from "../../../system/archive";
import {
  directoryExists,
  ensureDirectory,
  fileExists,
  readBytes,
  writeBytes,
} from "../../../system/fs";

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
 * Create archive metadata for a backup.
 */
const createBackupMetadata = (service: string, files: readonly string[]): ArchiveMetadata => ({
  version: "1.0",
  service,
  timestamp: new Date().toISOString(),
  files: [...files],
});

/**
 * Create a backup of the Actual data directory.
 * Creates a compressed tar archive using Bun.Archive.
 */
export const backupActual = (
  options: BackupOptions
): Effect.Effect<AbsolutePath, BackupError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { dataDir, logger } = options;

    // Check data directory exists
    const exists = yield* directoryExists(dataDir);
    if (!exists) {
      return yield* Effect.fail(
        new BackupError({
          code: ErrorCode.BACKUP_FAILED as 50,
          message: `Data directory not found: ${dataDir}`,
        })
      );
    }

    const timestamp = createBackupTimestamp();
    const backupFilename = `actual-backup-${timestamp}.tar.gz`;
    const backupsDir = pathJoin(dataDir, "backups");
    const backupPath = pathJoin(backupsDir, backupFilename);

    logger.info(`Creating backup: ${backupFilename}`);

    // Ensure backup directory exists
    yield* ensureDirectory(backupsDir);

    // Collect files to archive using FP-style utility
    // Excludes the backups directory to avoid recursion
    const { files, fileList } = yield* collectFilesWithContent(dataDir, ["backups/", "backups"]);

    // Create metadata and archive
    const metadata = createBackupMetadata("actual", fileList);

    const archiveData = yield* createArchive(files, {
      compress: "gzip",
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
  pattern = "*.tar.gz"
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

// ============================================================================
// Restore Helper Functions
// ============================================================================

/** Predicate: filename contains path traversal attack vectors */
const isUnsafeFilename = (name: string): boolean =>
  name.includes("..") || name.startsWith("/") || name.includes("\x00");

/** Predicate: parent dir differs from data dir and needs creation */
const needsParentDir = (parentDir: string, dataDir: string): boolean =>
  parentDir.length > 0 && parentDir !== dataDir;

/** Extract parent directory from path, None if at root */
const getParentDir = (fullPath: string): Option.Option<string> =>
  pipe(fullPath.lastIndexOf("/"), (idx) =>
    idx > 0 ? Option.some(fullPath.substring(0, idx)) : Option.none()
  );

/** Validate filename and fail with BackupError if unsafe */
const validateFilename = (
  name: string,
  backupPath: AbsolutePath
): Effect.Effect<void, BackupError> =>
  isUnsafeFilename(name)
    ? Effect.fail(
        new BackupError({
          code: ErrorCode.RESTORE_FAILED as 51,
          message: `Invalid filename in backup archive: ${name}. Potential path traversal detected.`,
          path: backupPath,
        })
      )
    : Effect.void;

/** Ensure parent directory exists if needed */
const ensureParentIfNeeded = (
  fullPath: string,
  dataDir: string
): Effect.Effect<void, SystemError | GeneralError> =>
  pipe(
    getParentDir(fullPath),
    Option.match({
      onNone: (): Effect.Effect<void, SystemError | GeneralError> => Effect.void,
      onSome: (parentDir): Effect.Effect<void, SystemError | GeneralError> =>
        needsParentDir(parentDir, dataDir)
          ? ensureDirectory(parentDir as AbsolutePath)
          : Effect.void,
    })
  );

/** Write single file with validation */
const writeValidatedFile =
  (dataDir: string, backupPath: AbsolutePath) =>
  ([name, content]: readonly [string, Uint8Array]): Effect.Effect<
    void,
    BackupError | SystemError | GeneralError
  > => {
    const fullPath = `${dataDir}/${name}`;
    return pipe(
      validateFilename(name, backupPath),
      Effect.flatMap(() => ensureParentIfNeeded(fullPath, dataDir)),
      Effect.flatMap(() =>
        Effect.tryPromise({
          try: (): Promise<number> => Bun.write(fullPath, content),
          catch: (e): SystemError =>
            new SystemError({
              code: ErrorCode.FILE_WRITE_FAILED as 28,
              message: `Failed to write file ${fullPath}: ${e}`,
            }),
        })
      ),
      Effect.asVoid
    );
  };

// ============================================================================
// Restore Command
// ============================================================================

/**
 * Restore from a backup archive.
 */
export const restoreActual = (
  backupPath: AbsolutePath,
  dataDir: AbsolutePath,
  _user: Username,
  _uid: UserId,
  logger: Logger
): Effect.Effect<void, BackupError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    // Check backup file exists
    const exists = yield* fileExists(backupPath);
    if (!exists) {
      return yield* Effect.fail(
        new BackupError({
          code: ErrorCode.BACKUP_NOT_FOUND as 52,
          message: `Backup file not found: ${backupPath}`,
          path: backupPath,
        })
      );
    }

    logger.info(`Restoring from: ${backupPath}`);
    logger.warn("This will overwrite existing data!");

    // Read and decompress archive
    const compressedData = yield* readBytes(backupPath);

    // Read and validate metadata
    const metadataOpt = yield* readArchiveMetadata(compressedData, { decompress: "gzip" });
    yield* Option.match(metadataOpt, {
      onNone: (): Effect.Effect<void, BackupError> => Effect.void,
      onSome: (metadata): Effect.Effect<void, BackupError> =>
        metadata.service !== "actual"
          ? Effect.fail(
              new BackupError({
                code: ErrorCode.RESTORE_FAILED as 51,
                message: `Backup is for service '${metadata.service}', not 'actual'. Use the correct restore command.`,
                path: backupPath,
              })
            )
          : Effect.sync(() =>
              logger.info(`Backup from: ${metadata.timestamp}, files: ${metadata.files.length}`)
            ),
    });

    // Extract archive
    const files = yield* extractArchive(compressedData, { decompress: "gzip" });

    // Filter metadata, then write files sequentially
    const filesToWrite = [...files].filter(([name]) => name !== "metadata.json");

    yield* Effect.forEach(filesToWrite, writeValidatedFile(dataDir, backupPath), {
      concurrency: 1,
      discard: true,
    });

    logger.success("Restore completed successfully");
  });
