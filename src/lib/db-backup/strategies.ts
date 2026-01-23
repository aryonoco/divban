// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Backup strategy implementations for different database types.
 * - PostgreSQL: Hot backup safe via pg_dumpall
 * - SQLite-Stop: Requires --force to stop container for safe backup
 * - FreshRSS CLI: Hot backup safe via PHP CLI tools
 */

import { Database } from "bun:sqlite";
import { Array as Arr, Effect, Match, Option, pipe } from "effect";
import { DEFAULT_TIMEOUTS } from "../../config/schema";
import { execAsUser } from "../../system/exec";
import { fileExists } from "../../system/fs";
import { startService, stopService } from "../../system/systemctl";
import { BACKUP_METADATA_FILENAME } from "../backup-compat";
import { collectFilesWithContent } from "../backup-utils";
import {
  BackupError,
  ErrorCode,
  GeneralError,
  type ServiceError,
  type SystemError,
  errorMessage,
} from "../errors";
import { extractCauseProps } from "../match-helpers";
import { heavyRetrySchedule, isTransientSystemError } from "../retry";
import type { AbsolutePath, ContainerName, ServiceName, UserId, Username } from "../types";
import { pathJoin } from "../types";
import type {
  BackupStrategy,
  CollectedFiles,
  FreshRssCliBackupConfig,
  PostgresBackupConfig,
  SqliteStopBackupConfig,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const execWithRetry = (
  user: Username,
  uid: UserId,
  command: readonly string[],
  options: {
    readonly timeout: number;
    readonly captureStdout?: boolean;
    readonly captureStderr?: boolean;
    readonly stdin?: string;
  }
): Effect.Effect<
  { readonly stdout: string; readonly stderr: string; readonly exitCode: number },
  SystemError | GeneralError
> =>
  execAsUser(user, uid, command, options).pipe(
    Effect.retry({
      schedule: heavyRetrySchedule,
      while: (err): boolean => isTransientSystemError(err),
    })
  );

const resolveContainer = (serviceName: ServiceName, config: PostgresBackupConfig): ContainerName =>
  Match.value(config.container).pipe(
    Match.when({ kind: "service" }, (): ContainerName => serviceName as unknown as ContainerName),
    Match.when({ kind: "separate" }, (loc): ContainerName => loc.name),
    Match.exhaustive
  );

/** Path traversal attack vectors: parent refs, absolute paths, null bytes */
const isUnsafeFilename = (name: string): boolean =>
  name.includes("..") || name.startsWith("/") || name.includes("\x00");

const validateFilename = (name: string): Effect.Effect<void, BackupError> =>
  Effect.if(isUnsafeFilename(name), {
    onTrue: (): Effect.Effect<void, BackupError> =>
      Effect.fail(
        new BackupError({
          code: ErrorCode.RESTORE_FAILED as 51,
          message: `Invalid filename in backup archive: ${name}. Potential path traversal detected.`,
        })
      ),
    onFalse: (): Effect.Effect<void, BackupError> => Effect.void,
  });

const getParentDir = (fullPath: string): Option.Option<string> =>
  pipe(fullPath.lastIndexOf("/"), (idx) =>
    idx > 0 ? Option.some(fullPath.substring(0, idx)) : Option.none()
  );

const ensureParentDirExists = (parentDir: string): Effect.Effect<void, BackupError> =>
  Effect.tryPromise({
    try: async (): Promise<void> => {
      await Bun.$`mkdir -p ${parentDir}`.quiet();
    },
    catch: (e): BackupError =>
      new BackupError({
        code: ErrorCode.RESTORE_FAILED as 51,
        message: `Failed to create parent directory: ${errorMessage(e)}`,
        ...extractCauseProps(e),
      }),
  });

const ensureParentIfNeeded = (
  fullPath: string,
  dataDir: string
): Effect.Effect<void, BackupError> =>
  pipe(
    getParentDir(fullPath),
    Option.match({
      onNone: (): Effect.Effect<void, BackupError> => Effect.void,
      onSome: (parentDir): Effect.Effect<void, BackupError> =>
        Effect.if(parentDir.length > 0 && parentDir !== dataDir, {
          onTrue: (): Effect.Effect<void, BackupError> => ensureParentDirExists(parentDir),
          onFalse: (): Effect.Effect<void, BackupError> => Effect.void,
        }),
    })
  );

const writeValidatedFile = (
  dataDir: AbsolutePath,
  name: string,
  content: Uint8Array
): Effect.Effect<void, BackupError> => {
  const fullPath = pathJoin(dataDir, name);
  return pipe(
    validateFilename(name),
    Effect.flatMap((): Effect.Effect<void, BackupError> => ensureParentIfNeeded(fullPath, dataDir)),
    Effect.flatMap(
      (): Effect.Effect<void, BackupError> =>
        Effect.tryPromise({
          try: (): Promise<number> => Bun.write(fullPath, content),
          catch: (e): BackupError =>
            new BackupError({
              code: ErrorCode.RESTORE_FAILED as 51,
              message: `Failed to write file ${fullPath}: ${errorMessage(e)}`,
              ...extractCauseProps(e),
            }),
        }).pipe(Effect.asVoid)
    )
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL Strategy (Immich) - Hot backup safe
// ─────────────────────────────────────────────────────────────────────────────

export const postgresStrategy: BackupStrategy<PostgresBackupConfig> = {
  filenameInfix: "db",
  compression: "zstd",
  requiresForce: false,

  collectData: (
    config,
    options
  ): Effect.Effect<CollectedFiles, BackupError | SystemError | GeneralError> =>
    Effect.gen(function* () {
      const { serviceName, user, uid } = options;
      const container = resolveContainer(serviceName, config);

      const dumpResult = yield* execWithRetry(
        user,
        uid,
        ["podman", "exec", container, "pg_dumpall", "-U", config.user, "--clean", "--if-exists"],
        { timeout: DEFAULT_TIMEOUTS.backup, captureStdout: true, captureStderr: true }
      );

      yield* pipe(
        Effect.succeed(dumpResult),
        Effect.filterOrFail(
          (r): r is typeof r & { readonly exitCode: 0 } => r.exitCode === 0,
          (r): BackupError =>
            new BackupError({
              code: ErrorCode.BACKUP_FAILED as 50,
              message: `Database dump failed: ${r.stderr}`,
            })
        )
      );

      return {
        files: { "database.sql": dumpResult.stdout },
        fileList: ["database.sql"] as const,
      };
    }),

  restoreData: (config, options): Effect.Effect<void, BackupError | SystemError | GeneralError> =>
    Effect.gen(function* () {
      const { serviceName, user, uid, files } = options;
      const container = resolveContainer(serviceName, config);

      const sqlBytes = yield* pipe(
        Effect.succeed(files.get("database.sql")),
        Effect.filterOrFail(
          (d): d is Uint8Array => d !== undefined,
          (): BackupError =>
            new BackupError({
              code: ErrorCode.RESTORE_FAILED as 51,
              message: "Missing database.sql in backup archive",
            })
        )
      );

      const sqlData = new TextDecoder().decode(sqlBytes);

      const restoreResult = yield* execWithRetry(
        user,
        uid,
        ["podman", "exec", "-i", container, "psql", "-U", config.user, "-d", config.database],
        { timeout: DEFAULT_TIMEOUTS.restore, captureStderr: true, stdin: sqlData }
      );

      yield* Effect.if(restoreResult.exitCode !== 0 && restoreResult.stderr.includes("ERROR"), {
        onTrue: (): Effect.Effect<void, BackupError> =>
          Effect.fail(
            new BackupError({
              code: ErrorCode.RESTORE_FAILED as 51,
              message: `Database restore failed: ${restoreResult.stderr}`,
            })
          ),
        onFalse: (): Effect.Effect<void, never> => Effect.void,
      });
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// SQLite-Stop Strategy (Actual) - Requires --force to stop container
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely serialize SQLite database using bun:sqlite.
 * Uses SQLite's internal backup API which is safe even during writes.
 */
const serializeSqlite = (sqlitePath: AbsolutePath): Effect.Effect<Uint8Array, BackupError> =>
  Effect.try({
    try: (): Uint8Array => {
      const db = new Database(sqlitePath, { readonly: true });
      const data = db.serialize();
      db.close();
      return data;
    },
    catch: (e): BackupError =>
      new BackupError({
        code: ErrorCode.BACKUP_FAILED as 50,
        message: `Failed to serialize SQLite database: ${errorMessage(e)}`,
        ...extractCauseProps(e),
      }),
  });

/**
 * Restore SQLite database from serialized bytes.
 */
const deserializeSqlite = (
  sqlitePath: AbsolutePath,
  data: Uint8Array
): Effect.Effect<void, BackupError> =>
  Effect.try({
    try: (): void => {
      const db = Database.deserialize(data);
      db.exec(`VACUUM INTO '${sqlitePath}'`);
      db.close();
    },
    catch: (e): BackupError =>
      new BackupError({
        code: ErrorCode.RESTORE_FAILED as 51,
        message: `Failed to restore SQLite database: ${errorMessage(e)}`,
        ...extractCauseProps(e),
      }),
  });

export const sqliteStopStrategy: BackupStrategy<SqliteStopBackupConfig> = {
  filenameInfix: "data",
  compression: "gzip",
  requiresForce: true,

  collectData: (
    config,
    options
  ): Effect.Effect<CollectedFiles, BackupError | ServiceError | SystemError | GeneralError> =>
    Effect.gen(function* () {
      const { dataDir, user, uid, force } = options;

      // Check --force flag
      yield* pipe(
        Effect.succeed(force),
        Effect.filterOrFail(
          (f): f is true => f === true,
          (): GeneralError =>
            new GeneralError({
              code: ErrorCode.GENERAL_ERROR as 1,
              message:
                "SQLite databases require stopping the container for safe backup. Use --force to stop the container and create a consistent backup.",
            })
        )
      );

      // Stop container
      yield* stopService(`${config.container}.service`, { user, uid });

      // Wait for container to fully stop
      yield* Effect.promise(() => Bun.sleep(1000));

      // Serialize SQLite database safely
      const sqlitePath = pathJoin(dataDir, config.sqlitePath);

      // Check if SQLite file exists
      const sqliteExists = yield* fileExists(sqlitePath);
      yield* pipe(
        Effect.succeed(sqliteExists),
        Effect.filterOrFail(
          (exists): exists is true => exists === true,
          (): BackupError =>
            new BackupError({
              code: ErrorCode.BACKUP_FAILED as 50,
              message: `SQLite database not found: ${sqlitePath}`,
            })
        )
      );

      const sqliteData = yield* serializeSqlite(sqlitePath);

      // Collect additional files (e.g., user-files/*.blob)
      const exclusions = ["backups/", "backups", config.sqlitePath, ...config.exclude];
      const { files: additionalFiles, fileList: additionalFileList } =
        yield* collectFilesWithContent(dataDir, exclusions);

      // Filter to only include specified paths
      const filteredFiles = pipe(
        Object.entries(additionalFiles),
        Arr.filter(([path]) => config.includeFiles.some((pattern) => path.startsWith(pattern))),
        Object.fromEntries
      );
      const filteredFileList = pipe(
        additionalFileList,
        Arr.filter((path) => config.includeFiles.some((pattern) => path.startsWith(pattern)))
      );

      // Restart container (always, even on error)
      yield* startService(`${config.container}.service`, { user, uid });

      return {
        files: {
          [config.sqlitePath]: sqliteData,
          ...filteredFiles,
        },
        fileList: [config.sqlitePath, ...filteredFileList],
      };
    }),

  restoreData: (
    config,
    options
  ): Effect.Effect<void, BackupError | ServiceError | SystemError | GeneralError> =>
    Effect.gen(function* () {
      const { dataDir, user, uid, files } = options;

      // Stop container before restore
      yield* stopService(`${config.container}.service`, { user, uid });

      // Wait for container to fully stop
      yield* Effect.promise(() => Bun.sleep(1000));

      // Restore SQLite database
      const sqliteBytes = yield* pipe(
        Effect.succeed(files.get(config.sqlitePath)),
        Effect.filterOrFail(
          (d): d is Uint8Array => d !== undefined,
          (): BackupError =>
            new BackupError({
              code: ErrorCode.RESTORE_FAILED as 51,
              message: `Missing ${config.sqlitePath} in backup archive`,
            })
        )
      );

      const sqlitePath = pathJoin(dataDir, config.sqlitePath);
      yield* deserializeSqlite(sqlitePath, sqliteBytes);

      // Restore additional files
      const filesToWrite = pipe(
        Array.from(files.entries()),
        Arr.filter(
          ([name]): boolean => name !== BACKUP_METADATA_FILENAME && name !== config.sqlitePath
        )
      );

      yield* Effect.forEach(
        filesToWrite,
        ([name, content]): Effect.Effect<void, BackupError> =>
          writeValidatedFile(dataDir, name, content),
        { concurrency: 1, discard: true }
      );

      // Restart container
      yield* startService(`${config.container}.service`, { user, uid });
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// FreshRSS CLI Strategy - Hot backup safe via PHP CLI
// ─────────────────────────────────────────────────────────────────────────────

export const freshRssCliStrategy: BackupStrategy<FreshRssCliBackupConfig> = {
  filenameInfix: "data",
  compression: "gzip",
  requiresForce: false,

  collectData: (
    config,
    options
  ): Effect.Effect<CollectedFiles, BackupError | SystemError | GeneralError> =>
    Effect.gen(function* () {
      const { dataDir, user, uid } = options;

      // Run FreshRSS backup CLI (creates safe SQLite exports)
      const backupResult = yield* execWithRetry(
        user,
        uid,
        ["podman", "exec", config.container, "./cli/db-backup.php"],
        { timeout: DEFAULT_TIMEOUTS.backup, captureStdout: true, captureStderr: true }
      );

      yield* Effect.if(backupResult.exitCode !== 0, {
        onTrue: (): Effect.Effect<void, BackupError> =>
          Effect.fail(
            new BackupError({
              code: ErrorCode.BACKUP_FAILED as 50,
              message: `FreshRSS backup CLI failed: ${backupResult.stderr}`,
            })
          ),
        onFalse: (): Effect.Effect<void, never> => Effect.void,
      });

      // Now collect the data directory (includes backup.sqlite files)
      const exclusions = ["backups/", "backups", ...config.exclude];
      const result = yield* collectFilesWithContent(dataDir, exclusions);
      return result;
    }),

  restoreData: (config, options): Effect.Effect<void, BackupError | SystemError | GeneralError> =>
    Effect.gen(function* () {
      const { dataDir, user, uid, files } = options;

      // Write all files to data directory
      const filesToWrite = pipe(
        Array.from(files.entries()),
        Arr.filter(([name]): boolean => name !== BACKUP_METADATA_FILENAME)
      );

      yield* Effect.forEach(
        filesToWrite,
        ([name, content]): Effect.Effect<void, BackupError> =>
          writeValidatedFile(dataDir, name, content),
        { concurrency: 1, discard: true }
      );

      // Run FreshRSS restore CLI
      const restoreResult = yield* execWithRetry(
        user,
        uid,
        ["podman", "exec", config.container, "./cli/db-restore.php"],
        { timeout: DEFAULT_TIMEOUTS.restore, captureStdout: true, captureStderr: true }
      );

      yield* Effect.if(restoreResult.exitCode !== 0, {
        onTrue: (): Effect.Effect<void, BackupError> =>
          Effect.fail(
            new BackupError({
              code: ErrorCode.RESTORE_FAILED as 51,
              message: `FreshRSS restore CLI failed: ${restoreResult.stderr}`,
            })
          ),
        onFalse: (): Effect.Effect<void, never> => Effect.void,
      });
    }),
};
