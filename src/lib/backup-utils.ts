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

export const createBackupTimestamp = (): string =>
  pipe(new Date().toISOString(), sanitizeTimestamp);

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

export const createBackupMetadata = (service: string, files: string[]): ArchiveMetadata => ({
  version: "1.0",
  service,
  timestamp: new Date().toISOString(),
  files,
});

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

export const detectCompressionFormat = (path: string): Option.Option<"gzip" | "zstd"> =>
  pipe(
    COMPRESSION_EXTENSIONS,
    Arr.findFirst((entry) => entry.extensions.some((ext) => path.endsWith(ext))),
    Option.map((entry) => entry.format)
  );

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

const notExcluded =
  (exclude: readonly string[]) =>
  (path: string): boolean =>
    !exclude.some((ex) => path.startsWith(ex) || path === ex);

export const scanDirectoryFiles = (
  dir: string,
  exclude: readonly string[] = []
): Effect.Effect<readonly string[], never> =>
  Effect.gen(function* () {
    const glob = new Glob("**/*");
    const files = yield* collectAsyncOrDie(glob.scan({ cwd: dir, onlyFiles: true }));

    return files.filter(notExcluded(exclude));
  });

interface FileWithMtime {
  readonly name: string;
  readonly mtime: number;
}

const getFileMtime = (dir: string, name: string): Effect.Effect<FileWithMtime> =>
  Effect.promise(async () => ({
    name,
    mtime: (await Bun.file(`${dir}/${name}`).stat())?.mtimeMs ?? 0,
  }));

const sortByMtimeDesc = (files: readonly FileWithMtime[]): readonly string[] =>
  [...files].sort((a, b) => b.mtime - a.mtime).map((f) => f.name);

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

interface FileWithContent {
  readonly path: string;
  readonly content: Uint8Array;
}

const readFileContent = (dir: string, path: string): Effect.Effect<FileWithContent> =>
  Effect.promise(async () => ({
    path,
    content: await Bun.file(`${dir}/${path}`).bytes(),
  }));

const buildFilesRecord = (
  entries: readonly FileWithContent[]
): Readonly<Record<string, Uint8Array>> =>
  Object.fromEntries(entries.map((e) => [e.path, e.content]));

export interface CollectedFiles {
  readonly files: Readonly<Record<string, Uint8Array>>;
  readonly fileList: readonly string[];
}

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
