// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Actual Budget backup as single tar archive. The data directory
 * contains SQLite databases for each budget - all must be captured
 * together for consistency. Archives include metadata for restore
 * validation (service version, file list, timestamp).
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

const createBackupMetadata = (service: string, files: readonly string[]): ArchiveMetadata => ({
  version: "1.0",
  service,
  timestamp: new Date().toISOString(),
  files: [...files],
});

export const backupActual = (
  options: BackupOptions
): Effect.Effect<AbsolutePath, BackupError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { dataDir, logger } = options;

    yield* pipe(
      directoryExists(dataDir),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        () =>
          new BackupError({
            code: ErrorCode.BACKUP_FAILED as 50,
            message: `Data directory not found: ${dataDir}`,
          })
      )
    );

    const timestamp = createBackupTimestamp();
    const backupFilename = `actual-backup-${timestamp}.tar.gz`;
    const backupsDir = pathJoin(dataDir, "backups");
    const backupPath = pathJoin(backupsDir, backupFilename);

    logger.info(`Creating backup: ${backupFilename}`);

    yield* ensureDirectory(backupsDir);

    // Excludes the backups directory to avoid recursion
    const { files, fileList } = yield* collectFilesWithContent(dataDir, ["backups/", "backups"]);

    const metadata = createBackupMetadata("actual", fileList);

    const archiveData = yield* createArchive(files, {
      compress: "gzip",
      metadata,
    });

    yield* writeBytes(backupPath, archiveData);

    const stat = yield* Effect.promise(() => Bun.file(backupPath).stat());
    const size = stat?.size ?? 0;

    logger.success(`Backup created: ${backupPath} (${formatBytes(size)})`);
    return backupPath;
  });

export const listBackups = (
  dataDir: AbsolutePath,
  pattern = "*.tar.gz"
): Effect.Effect<string[], never> =>
  pipe(
    directoryExists(pathJoin(dataDir, "backups")),
    Effect.flatMap((exists) =>
      Effect.if(exists, {
        onTrue: (): Effect.Effect<string[], never> =>
          pipe(
            listFilesByMtime(pathJoin(dataDir, "backups"), pattern),
            Effect.map((files) => [...files])
          ),
        onFalse: (): Effect.Effect<string[], never> => Effect.succeed([] as string[]),
      })
    )
  );

/** Path traversal attack vectors: parent refs, absolute paths, null bytes */
const isUnsafeFilename = (name: string): boolean =>
  name.includes("..") || name.startsWith("/") || name.includes("\x00");

const needsParentDir = (parentDir: string, dataDir: string): boolean =>
  parentDir.length > 0 && parentDir !== dataDir;

const getParentDir = (fullPath: string): Option.Option<string> =>
  pipe(fullPath.lastIndexOf("/"), (idx) =>
    idx > 0 ? Option.some(fullPath.substring(0, idx)) : Option.none()
  );

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

export const restoreActual = (
  backupPath: AbsolutePath,
  dataDir: AbsolutePath,
  _user: Username,
  _uid: UserId,
  logger: Logger
): Effect.Effect<void, BackupError | SystemError | GeneralError> =>
  Effect.gen(function* () {
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

    logger.info(`Restoring from: ${backupPath}`);
    logger.warn("This will overwrite existing data!");

    const compressedData = yield* readBytes(backupPath);

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

    const files = yield* extractArchive(compressedData, { decompress: "gzip" });

    const filesToWrite = [...files].filter(([name]) => name !== "metadata.json");

    yield* Effect.forEach(filesToWrite, writeValidatedFile(dataDir, backupPath), {
      concurrency: 1,
      discard: true,
    });

    logger.success("Restore completed successfully");
  });
