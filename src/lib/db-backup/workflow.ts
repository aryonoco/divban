// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Generic backup/restore workflow with strategy dispatch.
 * Handles archive creation, metadata validation, and compression.
 */

import { Effect, Match, Option, pipe } from "effect";
import type { ArchiveMetadata } from "../../system/archive";
import { createArchive, extractArchive } from "../../system/archive";
import { ensureDirectory } from "../../system/directories";
import { fileExists, readBytes, writeBytes } from "../../system/fs";
import {
  createBackupMetadata,
  createBackupTimestamp,
  detectCompressionFormat,
} from "../backup-utils";
import {
  BACKUP_METADATA_FILENAME,
  type DivbanBackUpSchemaVersion,
  type DivbanProducerVersion,
  validateBackupCompatibility,
} from "../backup-version";
import {
  BackupError,
  ErrorCode,
  type GeneralError,
  type ServiceError,
  type SystemError,
} from "../errors";
import type { AbsolutePath, ServiceName, UserId, Username } from "../types";
import { pathJoin, userIdToGroupId } from "../types";
import { DIVBAN_VERSION } from "../version";
import { freshRssCliStrategy, postgresStrategy, sqliteStopStrategy } from "./strategies";
import type { BackupConfig, BackupStrategy } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Public API Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BackupOptions {
  readonly serviceName: ServiceName;
  readonly dataDir: AbsolutePath;
  readonly user: Username;
  readonly uid: UserId;
  readonly force: boolean;
}

export interface RestoreOptions {
  readonly serviceName: ServiceName;
  readonly dataDir: AbsolutePath;
  readonly user: Username;
  readonly uid: UserId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Types
// ─────────────────────────────────────────────────────────────────────────────

type BackupWorkflowError = BackupError | ServiceError | SystemError | GeneralError;

// ─────────────────────────────────────────────────────────────────────────────
// Generic Backup Implementation
// ─────────────────────────────────────────────────────────────────────────────

const executeBackup = <C extends BackupConfig>(
  config: C,
  strategy: BackupStrategy<C>,
  options: BackupOptions
): Effect.Effect<AbsolutePath, BackupWorkflowError> =>
  Effect.gen(function* () {
    const { serviceName, dataDir, user, uid, force } = options;

    const timestamp = createBackupTimestamp();
    const backupDir = pathJoin(dataDir, "backups");
    const ext = strategy.compression === "zstd" ? ".zst" : ".gz";
    const backupFilename = `${serviceName}-${strategy.filenameInfix}-backup-${timestamp}.tar${ext}`;
    const backupPath = pathJoin(backupDir, backupFilename);

    yield* ensureDirectory(backupDir, { uid, gid: userIdToGroupId(uid) });

    const { files, fileList } = yield* strategy.collectData(config, {
      serviceName,
      dataDir,
      user,
      uid,
      force,
    });
    const metadata = createBackupMetadata(serviceName, [...fileList]);

    const archiveData = yield* createArchive(files, {
      compress: strategy.compression,
      metadata,
    });

    yield* writeBytes(backupPath, archiveData);
    return backupPath;
  });

// ─────────────────────────────────────────────────────────────────────────────
// Generic Restore Implementation
// ─────────────────────────────────────────────────────────────────────────────

const executeRestore = <C extends BackupConfig>(
  backupPath: AbsolutePath,
  config: C,
  strategy: BackupStrategy<C>,
  options: RestoreOptions
): Effect.Effect<void, BackupWorkflowError> =>
  Effect.gen(function* () {
    const { serviceName, dataDir, user, uid } = options;

    yield* pipe(
      fileExists(backupPath),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        (): BackupError =>
          new BackupError({
            code: ErrorCode.BACKUP_NOT_FOUND as 52,
            message: `Backup file not found: ${backupPath}`,
            path: backupPath,
          })
      )
    );

    const compressedData = yield* readBytes(backupPath);

    const compression = pipe(
      detectCompressionFormat(backupPath),
      Option.getOrElse((): "gzip" | "zstd" => strategy.compression)
    );

    const files = yield* extractArchive(compressedData, { decompress: compression });

    // Validate metadata - backup MUST have metadata with correct producer and service
    const metadataBytes = files.get(BACKUP_METADATA_FILENAME);
    yield* pipe(
      Effect.succeed(metadataBytes),
      Effect.filterOrFail(
        (bytes): bytes is Uint8Array => bytes !== undefined,
        (): BackupError =>
          new BackupError({
            code: ErrorCode.RESTORE_FAILED as 51,
            message: `Invalid backup: missing ${BACKUP_METADATA_FILENAME}`,
          })
      ),
      Effect.flatMap(
        (bytes): Effect.Effect<ArchiveMetadata, BackupError> =>
          Effect.try({
            try: (): ArchiveMetadata =>
              JSON.parse(new TextDecoder().decode(bytes)) as ArchiveMetadata,
            catch: (): BackupError =>
              new BackupError({
                code: ErrorCode.RESTORE_FAILED as 51,
                message: `Invalid backup: malformed ${BACKUP_METADATA_FILENAME}`,
              }),
          })
      ),
      Effect.filterOrFail(
        (meta): meta is ArchiveMetadata => meta.producer === "divban",
        (meta): BackupError =>
          new BackupError({
            code: ErrorCode.RESTORE_FAILED as 51,
            message: `Backup was created by '${meta.producer ?? "unknown"}', not 'divban'`,
          })
      ),
      Effect.filterOrFail(
        (meta): meta is ArchiveMetadata => meta.service === serviceName,
        (meta): BackupError =>
          new BackupError({
            code: ErrorCode.RESTORE_FAILED as 51,
            message: `Backup is for '${meta.service}', not '${serviceName}'`,
          })
      ),
      Effect.flatMap(
        (meta): Effect.Effect<void, BackupError> =>
          validateBackupCompatibility(
            meta.schemaVersion as DivbanBackUpSchemaVersion,
            meta.producerVersion as DivbanProducerVersion,
            DIVBAN_VERSION
          )
      )
    );

    yield* strategy.restoreData(config, { serviceName, dataDir, user, uid, files });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Public Dispatchers (Match.exhaustive ensures all cases handled)
// ─────────────────────────────────────────────────────────────────────────────

export const backupService = (
  config: BackupConfig,
  options: BackupOptions
): Effect.Effect<AbsolutePath, BackupWorkflowError> =>
  Match.value(config).pipe(
    Match.when(
      { type: "postgres" },
      (c): Effect.Effect<AbsolutePath, BackupWorkflowError> =>
        executeBackup(c, postgresStrategy, options)
    ),
    Match.when(
      { type: "sqlite-stop" },
      (c): Effect.Effect<AbsolutePath, BackupWorkflowError> =>
        executeBackup(c, sqliteStopStrategy, options)
    ),
    Match.when(
      { type: "freshrss-cli" },
      (c): Effect.Effect<AbsolutePath, BackupWorkflowError> =>
        executeBackup(c, freshRssCliStrategy, options)
    ),
    Match.exhaustive
  );

export const restoreService = (
  backupPath: AbsolutePath,
  config: BackupConfig,
  options: RestoreOptions
): Effect.Effect<void, BackupWorkflowError> =>
  Match.value(config).pipe(
    Match.when(
      { type: "postgres" },
      (c): Effect.Effect<void, BackupWorkflowError> =>
        executeRestore(backupPath, c, postgresStrategy, options)
    ),
    Match.when(
      { type: "sqlite-stop" },
      (c): Effect.Effect<void, BackupWorkflowError> =>
        executeRestore(backupPath, c, sqliteStopStrategy, options)
    ),
    Match.when(
      { type: "freshrss-cli" },
      (c): Effect.Effect<void, BackupWorkflowError> =>
        executeRestore(backupPath, c, freshRssCliStrategy, options)
    ),
    Match.exhaustive
  );
