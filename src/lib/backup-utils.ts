// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Common backup infrastructure shared across service implementations.
 * Handles archive creation, compression detection, and backup rotation.
 * Service-specific backup commands delegate here for consistency.
 */

import { Glob } from "bun";
import { Array as Arr, Effect, Option, Order, pipe } from "effect";
import type { ArchiveMetadata } from "../system/archive";
import { createArchive } from "../system/archive";
import { directoryExists, ensureDirectory } from "../system/fs";
import { collectAsyncOrDie } from "./collection-utils";
import { BackupError, ErrorCode, type SystemError, errorMessage } from "./errors";
import type { Logger } from "./logger";
import { extractCauseProps } from "./match-helpers";
import { mapCharsToString } from "./str-transform";
import type { AbsolutePath } from "./types";

/** Sanitize ISO timestamp for filenames: replace : and . with - */
const sanitizeTimestamp = mapCharsToString((c) => (c === ":" || c === "." ? "-" : c));

/**
 * Create a backup-safe timestamp string.
 * Format: YYYY-MM-DDTHH-mm-ss-sssZ (ISO with colons/periods replaced)
 */
export const createBackupTimestamp = (): string =>
  pipe(new Date().toISOString(), sanitizeTimestamp);

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
          ...extractCauseProps(e),
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
  pipe(
    directoryExists(backupDir),
    Effect.flatMap((exists) =>
      Effect.if(exists, {
        onTrue: (): Effect.Effect<string[], SystemError> =>
          Effect.gen(function* () {
            const glob = new Glob(pattern);
            const files = yield* collectAsyncOrDie(glob.scan({ cwd: backupDir, onlyFiles: true }));

            const withStats = yield* Effect.forEach(
              files,
              (name) =>
                Effect.promise(async () => ({
                  name,
                  mtime: (await Bun.file(`${backupDir}/${name}`).stat())?.mtimeMs ?? 0,
                })),
              { concurrency: 10 }
            );

            const byMtimeDesc: Order.Order<{ mtime: number }> = pipe(
              Order.number,
              Order.mapInput((f: { mtime: number }) => f.mtime),
              Order.reverse
            );

            return pipe(
              withStats,
              Arr.sort(byMtimeDesc),
              Arr.map((f) => f.name)
            );
          }),
        onFalse: (): Effect.Effect<string[], SystemError> => Effect.succeed([]),
      })
    )
  );

/** Compression format detection thresholds */
const COMPRESSION_EXTENSIONS: readonly {
  readonly extensions: readonly string[];
  readonly format: "gzip" | "zstd";
}[] = [
  { extensions: [".tar.gz", ".gz"], format: "gzip" },
  { extensions: [".tar.zst", ".zst"], format: "zstd" },
];

/**
 * Detect compression format from file extension.
 */
export const detectCompressionFormat = (path: string): Option.Option<"gzip" | "zstd"> =>
  pipe(
    COMPRESSION_EXTENSIONS,
    Arr.findFirst((entry) => entry.extensions.some((ext) => path.endsWith(ext))),
    Option.map((entry) => entry.format)
  );

/**
 * Validate backup file exists before restore.
 */
export const validateBackupExists = (backupPath: AbsolutePath): Effect.Effect<void, BackupError> =>
  pipe(
    Effect.promise(() => Bun.file(backupPath).exists()),
    Effect.filterOrFail(
      (exists): exists is true => exists === true,
      () =>
        new BackupError({
          code: ErrorCode.BACKUP_NOT_FOUND as 51,
          message: `Backup file not found: ${backupPath}`,
        })
    ),
    Effect.asVoid
  );

/**
 * Get accurate file size using stat().
 */
export const getBackupFileSize = async (backupPath: AbsolutePath): Promise<number> => {
  const stat = await Bun.file(backupPath).stat();
  return stat?.size ?? 0;
};

/**
 * Validate backup metadata matches expected service.
 * Returns Ok if metadata is missing or service matches.
 */
export const validateBackupService = (
  metadata: Option.Option<ArchiveMetadata>,
  expectedService: string,
  logger: Logger
): Effect.Effect<void, BackupError> =>
  Option.match(metadata, {
    onNone: (): Effect.Effect<void, BackupError> => Effect.void, // No metadata = legacy backup, allow
    onSome: ({ service, timestamp }): Effect.Effect<void, BackupError> =>
      Effect.if(service === expectedService, {
        onTrue: (): Effect.Effect<void, BackupError> =>
          Effect.sync(() => logger.info(`Backup from: ${timestamp}, service: ${service}`)),
        onFalse: (): Effect.Effect<void, BackupError> =>
          Effect.fail(
            new BackupError({
              code: ErrorCode.RESTORE_FAILED as 52,
              message: `Backup is for service '${service}', not '${expectedService}'. Use the correct restore command.`,
            })
          ),
      }),
  });

// ============================================================================
// Directory Scanning Utilities
// ============================================================================

/**
 * Predicate: path does NOT match any exclusion pattern.
 * Pure function for use with filter.
 */
const notExcluded =
  (exclude: readonly string[]) =>
  (path: string): boolean =>
    !exclude.some((ex) => path.startsWith(ex) || path === ex);

/**
 * Scan directory and collect files, excluding patterns.
 * Uses Effect Stream instead of for-await loops.
 * Reusable across backup implementations.
 */
export const scanDirectoryFiles = (
  dir: string,
  exclude: readonly string[] = []
): Effect.Effect<readonly string[], never> =>
  Effect.gen(function* () {
    const glob = new Glob("**/*");
    const files = yield* collectAsyncOrDie(glob.scan({ cwd: dir, onlyFiles: true }));

    return files.filter(notExcluded(exclude));
  });

/** File entry with modification time. */
interface FileWithMtime {
  readonly name: string;
  readonly mtime: number;
}

/**
 * Get file stat safely, defaulting mtime to 0 on error.
 */
const getFileMtime = (dir: string, name: string): Effect.Effect<FileWithMtime> =>
  Effect.promise(async () => ({
    name,
    mtime: (await Bun.file(`${dir}/${name}`).stat())?.mtimeMs ?? 0,
  }));

/**
 * Sort files by mtime descending (newest first).
 * Pure function - creates new sorted array.
 */
const sortByMtimeDesc = (files: readonly FileWithMtime[]): readonly string[] =>
  [...files].sort((a, b) => b.mtime - a.mtime).map((f) => f.name);

/**
 * List files sorted by modification time (newest first).
 */
export const listFilesByMtime = (
  dir: string,
  pattern: string
): Effect.Effect<readonly string[], never> =>
  Effect.gen(function* () {
    const glob = new Glob(pattern);
    const files = yield* collectAsyncOrDie(glob.scan({ cwd: dir, onlyFiles: true }));

    const withStats = yield* Effect.forEach(files, (f) => getFileMtime(dir, f), {
      concurrency: 10,
    });

    return sortByMtimeDesc(withStats);
  });

/** File entry with content. */
interface FileWithContent {
  readonly path: string;
  readonly content: Uint8Array;
}

/**
 * Read file content from directory.
 */
const readFileContent = (dir: string, path: string): Effect.Effect<FileWithContent> =>
  Effect.promise(async () => ({
    path,
    content: await Bun.file(`${dir}/${path}`).bytes(),
  }));

/**
 * Build files record from entries.
 * Uses Object.fromEntries (pure - creates new object).
 */
const buildFilesRecord = (
  entries: readonly FileWithContent[]
): Readonly<Record<string, Uint8Array>> =>
  Object.fromEntries(entries.map((e) => [e.path, e.content]));

/**
 * Collected files result type.
 */
export interface CollectedFiles {
  readonly files: Readonly<Record<string, Uint8Array>>;
  readonly fileList: readonly string[];
}

/**
 * Collect files with their contents from a directory.
 */
export const collectFilesWithContent = (
  dir: string,
  exclude: readonly string[] = []
): Effect.Effect<CollectedFiles, never> =>
  pipe(
    scanDirectoryFiles(dir, exclude),
    Effect.flatMap((paths) =>
      Effect.forEach(paths, (p) => readFileContent(dir, p), { concurrency: 10 })
    ),
    Effect.map((entries) => ({
      files: buildFilesRecord(entries),
      fileList: entries.map((e) => e.path),
    }))
  );
