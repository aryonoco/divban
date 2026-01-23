// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Effect, Match, Option, pipe } from "effect";
import { DEFAULT_TIMEOUTS } from "../../../config/schema";
import { BackupError, ErrorCode, type GeneralError, type SystemError } from "../../../lib/errors";
import type { Logger } from "../../../lib/logger";
import type { AbsolutePath, UserId, Username } from "../../../lib/types";
import { extractArchive, readArchiveMetadata } from "../../../system/archive";
import { execAsUser } from "../../../system/exec";
import { fileExists, readBytes } from "../../../system/fs";
import { CONTAINERS } from "../constants";

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
  backupPath: AbsolutePath;
  user: Username;
  uid: UserId;
  logger: Logger;
  containerName?: string;
  database?: string;
  dbUser?: string;
}

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

    yield* pipe(
      fileExists(backupPath),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        () =>
          new BackupError({
            code: ErrorCode.BACKUP_NOT_FOUND as 52,
            message: `Backup file not found: ${backupPath}`,
            path: backupPath,
          })
      )
    );

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

    const compressedData = yield* readBytes(backupPath);

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

    const files = yield* extractArchive(compressedData, { decompress: compression });
    const sqlBytes = yield* pipe(
      Effect.succeed(files.get("database.sql")),
      Effect.filterOrFail(
        (bytes): bytes is Uint8Array => bytes !== undefined,
        () =>
          new BackupError({
            code: ErrorCode.RESTORE_FAILED as 51,
            message: "Backup archive does not contain database.sql",
            path: backupPath,
          })
      )
    );

    const sqlData = new TextDecoder().decode(sqlBytes);

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

    // psql may return non-zero for warnings, check stderr for actual errors
    type RestoreCheckEffect = Effect.Effect<void, BackupError>;
    yield* Effect.if(restoreResult.exitCode !== 0, {
      onTrue: (): RestoreCheckEffect =>
        Effect.if(restoreResult.stderr.includes("ERROR"), {
          onTrue: (): RestoreCheckEffect =>
            Effect.fail(
              new BackupError({
                code: ErrorCode.RESTORE_FAILED as 51,
                message: `Database restore failed: ${restoreResult.stderr}`,
                path: backupPath,
              })
            ),
          onFalse: (): RestoreCheckEffect =>
            Effect.sync(() =>
              logger.warn(`Restore completed with warnings: ${restoreResult.stderr}`)
            ),
        }),
      onFalse: (): RestoreCheckEffect => Effect.void,
    });

    logger.success("Database restored successfully");
  });

export const validateBackup = (
  backupPath: AbsolutePath
): Effect.Effect<void, BackupError | SystemError> =>
  Effect.gen(function* () {
    // Check file exists
    yield* pipe(
      fileExists(backupPath),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        () =>
          new BackupError({
            code: ErrorCode.BACKUP_NOT_FOUND as 52,
            message: `Backup file not found: ${backupPath}`,
            path: backupPath,
          })
      )
    );

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

    const compressedData = yield* readBytes(backupPath);

    const files = yield* extractArchive(compressedData, { decompress: compression });

    yield* pipe(
      Effect.succeed(files.has("database.sql")),
      Effect.filterOrFail(
        (has): has is true => has === true,
        () =>
          new BackupError({
            code: ErrorCode.RESTORE_FAILED as 51,
            message: "Invalid backup file: missing database.sql in archive",
            path: backupPath,
          })
      )
    );
  });
