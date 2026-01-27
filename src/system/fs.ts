// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Filesystem operations wrapped in Effect for typed error handling.
 * Atomic writes use temp file + rename to prevent partial writes on failure.
 * File existence checks are non-throwing; reads return SystemError on failure.
 */

import { watch } from "node:fs";
import { mkdir, writeFile as nodeWriteFile, rename, rm } from "node:fs/promises";
import { type FileSink, Glob } from "bun";
import { Effect, Option, pipe } from "effect";
import { ErrorCode, SystemError, errorMessage } from "../lib/errors";
import { type AbsolutePath, pathWithSuffix } from "../lib/types";

/**
 * Helper to create a SystemError for file read failures.
 */
const fileReadError = (path: string, e: unknown): SystemError =>
  new SystemError({
    code: ErrorCode.FILE_READ_FAILED,
    message: `Failed to read file: ${path}: ${errorMessage(e)}`,
    ...(e instanceof Error ? { cause: e } : {}),
  });

/**
 * Helper to create a SystemError for file write failures.
 */
const fileWriteError = (path: string, e: unknown): SystemError =>
  new SystemError({
    code: ErrorCode.FILE_WRITE_FAILED,
    message: `Failed to write file: ${path}: ${errorMessage(e)}`,
    ...(e instanceof Error ? { cause: e } : {}),
  });

/**
 * Helper to create a SystemError for directory creation failures.
 */
const directoryError = (path: string, e: unknown): SystemError =>
  new SystemError({
    code: ErrorCode.DIRECTORY_CREATE_FAILED,
    message: `Failed to create directory: ${path}: ${errorMessage(e)}`,
    ...(e instanceof Error ? { cause: e } : {}),
  });

/**
 * Read file contents as text.
 */
export const readFile = (path: AbsolutePath): Effect.Effect<string, SystemError> =>
  Effect.gen(function* () {
    const file = Bun.file(path);
    yield* pipe(
      Effect.tryPromise({
        try: (): Promise<boolean> => file.exists(),
        catch: (e): SystemError => fileReadError(path, e),
      }),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        () =>
          new SystemError({
            code: ErrorCode.FILE_READ_FAILED,
            message: `File not found: ${path}`,
          })
      )
    );

    return yield* Effect.tryPromise({
      try: (): Promise<string> => file.text(),
      catch: (e): SystemError => fileReadError(path, e),
    });
  });

/**
 * Read file contents as lines.
 */
export const readLines = (path: AbsolutePath): Effect.Effect<string[], SystemError> =>
  Effect.map(readFile(path), (content) => content.split("\n").map((line) => line.trimEnd()));

/**
 * Read file contents as bytes (Uint8Array).
 */
export const readBytes = (path: AbsolutePath): Effect.Effect<Uint8Array, SystemError> =>
  Effect.gen(function* () {
    const file = Bun.file(path);
    yield* pipe(
      Effect.tryPromise({
        try: (): Promise<boolean> => file.exists(),
        catch: (e): SystemError => fileReadError(path, e),
      }),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        () =>
          new SystemError({
            code: ErrorCode.FILE_READ_FAILED,
            message: `File not found: ${path}`,
          })
      )
    );

    return yield* Effect.tryPromise({
      try: (): Promise<Uint8Array> => file.bytes(),
      catch: (e): SystemError => fileReadError(path, e),
    });
  });

/**
 * Write binary content to a file.
 */
export const writeBytes = (
  path: AbsolutePath,
  data: Uint8Array
): Effect.Effect<void, SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<void> => {
      await Bun.write(path, data);
    },
    catch: (e): SystemError => fileWriteError(path, e),
  });

/**
 * Write content to a file.
 */
export const writeFile = (path: AbsolutePath, content: string): Effect.Effect<void, SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<void> => {
      await Bun.write(path, content);
    },
    catch: (e): SystemError => fileWriteError(path, e),
  });

/**
 * Create a file exclusively - fails if file already exists.
 * Uses O_CREAT | O_EXCL via 'wx' flag for atomic check-and-create.
 * Returns Some(void) if created, None if file existed.
 */
export const writeFileExclusive = (
  path: AbsolutePath,
  content: string
): Effect.Effect<Option.Option<void>, SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<Option.Option<void>> => {
      await nodeWriteFile(path, content, { flag: "wx", encoding: "utf8" });
      return Option.some(undefined);
    },
    catch: (e): SystemError | null => {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") {
        // Return success with None - file already exists is not an error
        return null; // Sentinel value to indicate existing file
      }
      return fileWriteError(path, e);
    },
  }).pipe(
    Effect.flatMap((result) =>
      result === null
        ? Effect.succeed(Option.none())
        : Effect.succeed(result as Option.Option<void>)
    ),
    Effect.catchAll((e) => {
      if (e === null) {
        return Effect.succeed(Option.none());
      }
      return Effect.fail(e as SystemError);
    })
  );

/**
 * Create a file writer for incremental writes.
 */
export interface FileWriter {
  writer: FileSink;
  close: () => number | Promise<number>;
}

export const createFileWriter = (path: AbsolutePath): FileWriter => {
  const file = Bun.file(path);
  const writer = file.writer();
  return {
    writer,
    close: (): number | Promise<number> => writer.end(),
  };
};

/**
 * Append content to a file.
 */
export const appendFile = (path: AbsolutePath, content: string): Effect.Effect<void, SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<void> => {
      const file = Bun.file(path);
      const writer = file.writer();
      writer.write(content);
      await writer.end();
    },
    catch: (e): SystemError => fileWriteError(path, e),
  });

/**
 * Check if a file exists.
 */
export const fileExists = (path: AbsolutePath): Effect.Effect<boolean, never> =>
  Effect.promise(() => Bun.file(path).exists());

/**
 * Check if a path is a directory.
 */
export const isDirectory = (path: string): Effect.Effect<boolean, never> =>
  Effect.promise(async () => {
    try {
      const s = await Bun.file(path).stat();
      return s?.isDirectory() ?? false;
    } catch {
      return false;
    }
  });

/**
 * Copy a file using kernel-level operations.
 */
export const copyFile = (
  source: AbsolutePath,
  dest: AbsolutePath
): Effect.Effect<void, SystemError> =>
  Effect.gen(function* () {
    const sourceFile = Bun.file(source);
    yield* pipe(
      Effect.tryPromise({
        try: (): Promise<boolean> => sourceFile.exists(),
        catch: (e): SystemError => fileReadError(source, e),
      }),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        () =>
          new SystemError({
            code: ErrorCode.FILE_READ_FAILED,
            message: `Source file not found: ${source}`,
          })
      )
    );

    yield* Effect.tryPromise({
      try: (): Promise<number> => Bun.write(dest, sourceFile),
      catch: (e): SystemError =>
        new SystemError({
          code: ErrorCode.FILE_WRITE_FAILED,
          message: `Failed to copy file from ${source} to ${dest}: ${errorMessage(e)}`,
          ...(e instanceof Error ? { cause: e } : {}),
        }),
    });
  });

/**
 * Create a backup of a file (adds .bak extension).
 */
export const backupFile = (filePath: AbsolutePath): Effect.Effect<AbsolutePath, SystemError> =>
  Effect.gen(function* () {
    const backupPath = pathWithSuffix(filePath, ".bak");
    yield* copyFile(filePath, backupPath);
    return backupPath;
  });

/**
 * Read file if it exists, return empty string otherwise.
 */
export const readFileOrEmpty = (path: AbsolutePath): Effect.Effect<string, never> =>
  Effect.catchAll(readFile(path), () => Effect.succeed(""));

/**
 * Atomically write a file by writing to a temp file first.
 */
export const atomicWrite = (
  filePath: AbsolutePath,
  content: string
): Effect.Effect<void, SystemError> =>
  Effect.gen(function* () {
    const tempPath = pathWithSuffix(
      filePath,
      `.tmp.${Bun.nanoseconds()}.${Math.random().toString(36).slice(2, 8)}`
    );

    yield* writeFile(tempPath, content);
    yield* renameFile(tempPath, filePath);
  });

/**
 * Atomically rename a file.
 */
export const renameFile = (
  source: AbsolutePath,
  dest: AbsolutePath
): Effect.Effect<void, SystemError> =>
  Effect.tryPromise({
    try: (): Promise<void> => rename(source, dest),
    catch: (e): SystemError =>
      new SystemError({
        code: ErrorCode.FILE_WRITE_FAILED,
        message: `Failed to rename ${source} to ${dest}: ${errorMessage(e)}`,
        ...(e instanceof Error ? { cause: e } : {}),
      }),
  });

/**
 * Compare two files for equality.
 */
export const filesEqual = (
  path1: AbsolutePath,
  path2: AbsolutePath
): Effect.Effect<boolean, SystemError> =>
  Effect.gen(function* () {
    const [content1, content2] = yield* Effect.all([readFile(path1), readFile(path2)]);
    return content1 === content2;
  });

/**
 * Get file size in bytes.
 */
export const getFileSize = (path: AbsolutePath): Effect.Effect<number, SystemError> =>
  Effect.gen(function* () {
    const file = Bun.file(path);
    yield* pipe(
      Effect.tryPromise({
        try: (): Promise<boolean> => file.exists(),
        catch: (e): SystemError => fileReadError(path, e),
      }),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        () =>
          new SystemError({
            code: ErrorCode.FILE_READ_FAILED,
            message: `File not found: ${path}`,
          })
      )
    );

    return file.size;
  });

/**
 * Check if a directory exists.
 */
export const directoryExists = (path: AbsolutePath): Effect.Effect<boolean, never> =>
  Effect.promise(async () => {
    try {
      const file = Bun.file(path);
      const s = await file.stat();
      return s?.isDirectory() ?? false;
    } catch {
      return false;
    }
  });

/**
 * Ensure a directory exists (mkdir -p equivalent).
 */
export const ensureDirectory = (path: AbsolutePath): Effect.Effect<void, SystemError> =>
  Effect.tryPromise({
    try: (): Promise<void> => mkdir(path, { recursive: true }).then(() => undefined),
    catch: (e): SystemError => directoryError(path, e),
  });

/**
 * List files in a directory.
 */
export const listDirectory = (path: AbsolutePath): Effect.Effect<readonly string[], SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<readonly string[]> => {
      const glob = new Glob("*");
      return await Array.fromAsync(glob.scan({ cwd: path, onlyFiles: false }));
    },
    catch: (e): SystemError => fileReadError(path, e),
  });

/**
 * Find files matching a glob pattern.
 */
export const globFiles = (
  pattern: string,
  options: { readonly cwd?: string; readonly onlyFiles?: boolean } = {}
): Effect.Effect<readonly string[], never> =>
  Effect.promise(async (): Promise<readonly string[]> => {
    const glob = new Glob(pattern);
    return await Array.fromAsync(
      glob.scan({
        cwd: options.cwd ?? ".",
        onlyFiles: options.onlyFiles ?? true,
      })
    );
  });

/**
 * Check if a path matches a glob pattern.
 */
export const globMatch = (pattern: string, path: string): boolean => {
  const glob = new Glob(pattern);
  return glob.match(path);
};

/**
 * Delete a file.
 * Returns success if file was deleted or didn't exist.
 */
export const deleteFile = (path: AbsolutePath): Effect.Effect<void, SystemError> =>
  Effect.gen(function* () {
    const file = Bun.file(path);
    const exists = yield* Effect.promise(() => file.exists());

    yield* Effect.if(exists, {
      onTrue: (): Effect.Effect<void, SystemError> =>
        Effect.tryPromise({
          try: (): Promise<void> => file.delete(),
          catch: (e): SystemError => fileWriteError(path, e),
        }),
      onFalse: (): Effect.Effect<void, SystemError> => Effect.void,
    });
  });

/**
 * Delete a file only if it exists.
 * Returns true if file was deleted, false if it didn't exist.
 */
export const deleteFileIfExists = (path: AbsolutePath): Effect.Effect<boolean, SystemError> =>
  Effect.gen(function* () {
    const file = Bun.file(path);
    const exists = yield* Effect.promise(() => file.exists());

    return yield* Effect.if(exists, {
      onTrue: (): Effect.Effect<boolean, SystemError> =>
        pipe(
          Effect.tryPromise({
            try: (): Promise<void> => file.delete(),
            catch: (e): SystemError => fileWriteError(path, e),
          }),
          Effect.as(true)
        ),
      onFalse: (): Effect.Effect<boolean, SystemError> => Effect.succeed(false),
    });
  });

/**
 * Delete a directory recursively.
 */
export const deleteDirectory = (path: AbsolutePath): Effect.Effect<void, SystemError> =>
  Effect.tryPromise({
    try: (): Promise<void> => rm(path, { recursive: true, force: true }),
    catch: (e): SystemError =>
      new SystemError({
        code: ErrorCode.DIRECTORY_CREATE_FAILED,
        message: `Failed to delete directory: ${path}: ${errorMessage(e)}`,
        ...(e instanceof Error ? { cause: e } : {}),
      }),
  });

/**
 * Hash file contents using Bun.hash() for fast non-cryptographic hashing.
 */
export const hashFile = (path: AbsolutePath): Effect.Effect<number | bigint, SystemError> =>
  Effect.map(readFile(path), Bun.hash);

/**
 * Hash content using Bun.hash() for fast non-cryptographic hashing.
 */
export const hashContent = (content: string | Uint8Array): number | bigint => Bun.hash(content);

/**
 * Compute SHA-256 hash of a file.
 */
export const sha256File = (path: AbsolutePath): Effect.Effect<string, SystemError> =>
  Effect.gen(function* () {
    const file = Bun.file(path);
    yield* pipe(
      Effect.tryPromise({
        try: (): Promise<boolean> => file.exists(),
        catch: (e): SystemError => fileReadError(path, e),
      }),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        () =>
          new SystemError({
            code: ErrorCode.FILE_READ_FAILED,
            message: `File not found: ${path}`,
          })
      )
    );

    return yield* Effect.tryPromise({
      try: async (): Promise<string> => {
        const hasher = new Bun.CryptoHasher("sha256");
        hasher.update(await file.arrayBuffer());
        return hasher.digest("hex");
      },
      catch: (e): SystemError => fileReadError(path, e),
    });
  });

/**
 * Deep equality comparison using Bun.deepEquals.
 */
export const objectsEqual = <T>(a: T, b: NoInfer<T>, strict = false): boolean =>
  Bun.deepEquals(a, b, strict);

/**
 * Supported hash algorithms for hashContentWith.
 */
export type HashAlgorithm = "sha256" | "sha512" | "sha1" | "md5" | "blake2b256" | "blake2b512";

/**
 * Hash content with a specified algorithm.
 */
export const hashContentWith = (
  content: string | Uint8Array | ArrayBuffer,
  algorithm: HashAlgorithm,
  encoding: "hex" | "base64" = "hex"
): string => {
  const hasher = new Bun.CryptoHasher(algorithm);
  hasher.update(content);
  return hasher.digest(encoding);
};

/**
 * Watch a file for changes.
 * Returns a cleanup function to stop watching.
 */
export const watchFile = (
  path: AbsolutePath,
  callback: (eventType: string) => void
): (() => void) => {
  const watcher = watch(path, (eventType: string) => {
    callback(eventType);
  });
  const cleanup = (): void => {
    watcher.close();
  };
  return cleanup;
};
