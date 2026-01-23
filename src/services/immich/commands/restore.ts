// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Immich database restore command.
 */

import { Effect, Match, Option, pipe } from "effect";
import { DEFAULT_TIMEOUTS } from "../../../config/schema";
import { BackupError, ErrorCode, type GeneralError, type SystemError } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import type { AbsolutePath, UserId, Username } from "../../../lib/types";
import { extractArchive, readArchiveMetadata } from "../../../system/archive";
import { execAsUser } from "../../../system/exec";
import { fileExists, readBytes } from "../../../system/fs";
import { CONTAINERS } from "../constants";

/**
 * Detect compression format from file extension.
 */
const detectCompressionFormat = (path: string): Option.Option<"gzip" | "zstd"> =>
  pipe(
    path,
    Match.value,
    Match.when(
      (p) => p.endsWith(".tar.gz") || p.endsWith(".gz"),
      () => Option.some("gzip" as const)
    ),
    Match.when(
      (p) => p.endsWith(".tar.zst") || p.endsWith(".zst"),
      () => Option.some("zstd" as const)
    ),
    Match.orElse(() => Option.none())
  );

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
export const restoreDatabase = (
  options: RestoreOptions
): Effect.Effect<void, BackupError | SystemError | GeneralError> =>
  Effect.gen(function* () {
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

    logger.info(`Restoring database from: ${backupPath}`);
    logger.warn("This will overwrite the existing database!");

    // Detect compression type
    type CompressionResult = Effect.Effect<"gzip" | "zstd", BackupError>;
    const compression = yield* Option.match(detectCompressionFormat(backupPath), {
      onNone: (): CompressionResult =>
        Effect.fail(
          new BackupError({
            code: ErrorCode.RESTORE_FAILED as 51,
            message: `Unsupported backup format: ${backupPath}. Expected .tar.gz or .tar.zst`,
            path: backupPath,
          })
        ),
      onSome: (c): CompressionResult => Effect.succeed(c),
    });

    // Read the backup file
    const compressedData = yield* readBytes(backupPath);

    // Read and validate metadata
    const metadataOpt = yield* readArchiveMetadata(compressedData, { decompress: compression });
    yield* Option.match(metadataOpt, {
      onNone: (): Effect.Effect<void, BackupError> => Effect.void,
      onSome: (metadata): Effect.Effect<void, BackupError> =>
        metadata.service !== "immich"
          ? Effect.fail(
              new BackupError({
                code: ErrorCode.RESTORE_FAILED as 51,
                message: `Backup is for service '${metadata.service}', not 'immich'. Use the correct restore command.`,
                path: backupPath,
              })
            )
          : Effect.sync(() =>
              logger.info(`Backup from: ${metadata.timestamp}, service: ${metadata.service}`)
            ),
    });

    // Extract archive
    const files = yield* extractArchive(compressedData, { decompress: compression });
    const sqlBytes = files.get("database.sql");
    if (sqlBytes === undefined) {
      return yield* Effect.fail(
        new BackupError({
          code: ErrorCode.RESTORE_FAILED as 51,
          message: "Backup archive does not contain database.sql",
          path: backupPath,
        })
      );
    }

    const sqlData = new TextDecoder().decode(sqlBytes);

    // Restore using psql
    const restoreResult = yield* execAsUser(
      user,
      uid,
      ["podman", "exec", "-i", containerName, "psql", "-U", dbUser, "-d", database],
      {
        timeout: DEFAULT_TIMEOUTS.restore,
        stdin: sqlData,
        captureStdout: true,
        captureStderr: true,
      }
    );

    if (restoreResult.exitCode !== 0) {
      // psql may return non-zero for warnings, check stderr
      const stderr = restoreResult.stderr;
      if (stderr.includes("ERROR")) {
        return yield* Effect.fail(
          new BackupError({
            code: ErrorCode.RESTORE_FAILED as 51,
            message: `Database restore failed: ${stderr}`,
            path: backupPath,
          })
        );
      }
      // Warnings are OK
      logger.warn(`Restore completed with warnings: ${stderr}`);
    }

    logger.success("Database restored successfully");
  });

/**
 * Validate a backup file.
 * Uses Bun's native decompression to validate.
 */
export const validateBackup = (
  backupPath: AbsolutePath
): Effect.Effect<void, BackupError | SystemError> =>
  Effect.gen(function* () {
    // Check file exists
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

    // Detect compression type
    type CompressionResult = Effect.Effect<"gzip" | "zstd", BackupError>;
    const compression = yield* Option.match(detectCompressionFormat(backupPath), {
      onNone: (): CompressionResult =>
        Effect.fail(
          new BackupError({
            code: ErrorCode.RESTORE_FAILED as 51,
            message: `Unsupported backup format: ${backupPath}. Expected .tar.gz or .tar.zst`,
            path: backupPath,
          })
        ),
      onSome: (c): CompressionResult => Effect.succeed(c),
    });

    // Read and decompress the archive
    const compressedData = yield* readBytes(backupPath);

    // Attempt to extract - this validates both compression and tar format
    const files = yield* extractArchive(compressedData, { decompress: compression });

    // Check for database.sql
    if (!files.has("database.sql")) {
      return yield* Effect.fail(
        new BackupError({
          code: ErrorCode.RESTORE_FAILED as 51,
          message: "Invalid backup file: missing database.sql in archive",
          path: backupPath,
        })
      );
    }
  });
