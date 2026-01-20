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
import { Effect } from "effect";
import type { ArchiveMetadata } from "../system/archive";
import { createArchive } from "../system/archive";
import { directoryExists, ensureDirectory } from "../system/fs";
import { BackupError, ErrorCode, type SystemError, errorMessage } from "./errors";
import type { Logger } from "./logger";
import { None, type Option, Some, isNone } from "./option";
import type { AbsolutePath } from "./types";

/**
 * Create a backup-safe timestamp string.
 * Format: YYYY-MM-DDTHH-mm-ss-sssZ (ISO with colons/periods replaced)
 */
export const createBackupTimestamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");

/**
 * Ensure backup directory exists with proper error mapping.
 */
export const ensureBackupDirectory = (backupDir: AbsolutePath): Effect.Effect<void, BackupError> =>
  ensureDirectory(backupDir).pipe(
    Effect.mapError(
      (err) =>
        new BackupError({
          code: ErrorCode.BACKUP_FAILED as 50,
          message: `Failed to create backup directory: ${err.message}`,
          cause: err,
        })
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
 */
export const writeBackupArchive = (
  backupPath: AbsolutePath,
  files: Record<string, string | Uint8Array | Blob>,
  options: { compress: "gzip" | "zstd"; metadata: ArchiveMetadata }
): Effect.Effect<void, BackupError> =>
  Effect.gen(function* () {
    // createArchive returns Effect.Effect<Uint8Array, never>
    const archiveData = yield* createArchive(files, {
      compress: options.compress,
      metadata: options.metadata,
    });

    yield* Effect.tryPromise({
      try: (): Promise<number> => Bun.write(backupPath, archiveData),
      catch: (e): BackupError =>
        new BackupError({
          code: ErrorCode.BACKUP_FAILED as 50,
          message: `Failed to write backup file: ${errorMessage(e)}`,
          ...(e instanceof Error ? { cause: e } : {}),
        }),
    });
  });

/**
 * List backup files in a directory, sorted by modification time (newest first).
 * @param backupDir - Directory containing backups
 * @param pattern - Glob pattern (default: "*.tar.{gz,zst}" for both formats)
 */
export const listBackupFiles = (
  backupDir: AbsolutePath,
  pattern = "*.tar.{gz,zst}"
): Effect.Effect<string[], SystemError> =>
  Effect.gen(function* () {
    const exists = yield* directoryExists(backupDir);
    if (!exists) {
      return [];
    }

    const glob = new Glob(pattern);
    const files: string[] = [];

    // Wrap async iterator in Effect.promise
    yield* Effect.promise(async () => {
      for await (const file of glob.scan({ cwd: backupDir, onlyFiles: true })) {
        files.push(file);
      }
    });

    // Sort by modification time (newest first)
    const withStats = yield* Effect.promise(async () => {
      return await Promise.all(
        files.map(async (f) => ({
          name: f,
          mtime: (await Bun.file(`${backupDir}/${f}`).stat())?.mtimeMs ?? 0,
        }))
      );
    });

    withStats.sort((a, b) => b.mtime - a.mtime);
    return withStats.map((f) => f.name);
  });

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
export const validateBackupExists = (backupPath: AbsolutePath): Effect.Effect<void, BackupError> =>
  Effect.gen(function* () {
    const file = Bun.file(backupPath);
    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      return yield* Effect.fail(
        new BackupError({
          code: ErrorCode.BACKUP_NOT_FOUND as 51,
          message: `Backup file not found: ${backupPath}`,
        })
      );
    }
  });

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
 */
export const validateBackupService = (
  metadata: Option<ArchiveMetadata>,
  expectedService: string,
  logger: Logger
): Effect.Effect<void, BackupError> => {
  if (isNone(metadata)) {
    return Effect.void; // No metadata = legacy backup, allow
  }

  const { service, timestamp } = metadata.value;

  if (service !== expectedService) {
    return Effect.fail(
      new BackupError({
        code: ErrorCode.RESTORE_FAILED as 52,
        message: `Backup is for service '${service}', not '${expectedService}'. Use the correct restore command.`,
      })
    );
  }

  logger.info(`Backup from: ${timestamp}, service: ${service}`);
  return Effect.void;
};
