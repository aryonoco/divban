// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Filesystem operations using @effect/platform FileSystem internally.
 *
 * Atomic writes (temp file + rename) prevent partial content if process crashes.
 * Use atomicWrite for config files that services actively read.
 *
 * Idempotent operations (deleteFile, ensureDirectory) support rollback patterns
 * where the same cleanup may run multiple times on partial failure.
 *
 * Bun-specific: glob, hash, FileSink have no Effect equivalents.
 */

import { watch } from "node:fs";
import { FileSystem } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import type { PlatformError } from "@effect/platform/Error";
import { type FileSink, Glob } from "bun";
import { Effect, Option, pipe } from "effect";
import { ErrorCode, SystemError, errorMessage } from "../lib/errors";
import { type AbsolutePath, pathWithSuffix } from "../lib/types";

/** Internalizes BunFileSystem.layer so callers don't need R type parameter. */
const withFS = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>): Effect.Effect<A, E> =>
  effect.pipe(Effect.provide(BunFileSystem.layer));

const fileReadError = (path: string, e: unknown): SystemError =>
  new SystemError({
    code: ErrorCode.FILE_READ_FAILED,
    message: `Failed to read file: ${path}: ${errorMessage(e)}`,
    ...(e instanceof Error ? { cause: e } : {}),
  });

const fileWriteError = (path: string, e: unknown): SystemError =>
  new SystemError({
    code: ErrorCode.FILE_WRITE_FAILED,
    message: `Failed to write file: ${path}: ${errorMessage(e)}`,
    ...(e instanceof Error ? { cause: e } : {}),
  });

const directoryError = (path: string, e: unknown): SystemError =>
  new SystemError({
    code: ErrorCode.DIRECTORY_CREATE_FAILED,
    message: `Failed to create directory: ${path}: ${errorMessage(e)}`,
    ...(e instanceof Error ? { cause: e } : {}),
  });

// ============================================================================
// Read Operations
// ============================================================================

export const readFile = (path: AbsolutePath): Effect.Effect<string, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.readFileString(path);
    })
  ).pipe(Effect.mapError((e) => fileReadError(path, e)));

export const readLines = (path: AbsolutePath): Effect.Effect<string[], SystemError> =>
  Effect.map(readFile(path), (content) => content.split("\n").map((line) => line.trimEnd()));

export const readBytes = (path: AbsolutePath): Effect.Effect<Uint8Array, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.readFile(path);
    })
  ).pipe(Effect.mapError((e) => fileReadError(path, e)));

/** Use for optional config files where missing is equivalent to empty. */
export const readFileOrEmpty = (path: AbsolutePath): Effect.Effect<string, never> =>
  Effect.catchAll(readFile(path), () => Effect.succeed(""));

// ============================================================================
// Write Operations
// ============================================================================

export const writeFile = (path: AbsolutePath, content: string): Effect.Effect<void, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(path, content);
    })
  ).pipe(Effect.mapError((e) => fileWriteError(path, e)));

export const writeBytes = (
  path: AbsolutePath,
  data: Uint8Array
): Effect.Effect<void, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFile(path, data);
    })
  ).pipe(Effect.mapError((e) => fileWriteError(path, e)));

/** Returns Some if created, None if file existed. For setup idempotency. */
export const writeFileExclusive = (
  path: AbsolutePath,
  content: string
): Effect.Effect<Option.Option<void>, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const exists = yield* fs.exists(path);
      const none: Effect.Effect<Option.Option<void>, PlatformError> = Effect.succeed(
        Option.none<void>()
      );
      const write: Effect.Effect<Option.Option<void>, PlatformError> = pipe(
        fs.writeFileString(path, content),
        Effect.as(Option.some<void>(undefined))
      );
      return yield* Effect.if(exists, {
        onTrue: (): Effect.Effect<Option.Option<void>, PlatformError> => none,
        onFalse: (): Effect.Effect<Option.Option<void>, PlatformError> => write,
      });
    })
  ).pipe(Effect.mapError((e) => fileWriteError(path, e)));

/** Bun.FileSink for streaming writes. No Effect equivalent. */
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

export const appendFile = (path: AbsolutePath, content: string): Effect.Effect<void, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const existing = yield* Effect.catchAll(fs.readFileString(path), () => Effect.succeed(""));
      yield* fs.writeFileString(path, existing + content);
    })
  ).pipe(Effect.mapError((e) => fileWriteError(path, e)));

/**
 * Temp file + rename is atomic at filesystem level. Prevents partial writes
 * if process crashes mid-write. Use for config files services actively read.
 */
export const atomicWrite = (
  filePath: AbsolutePath,
  content: string
): Effect.Effect<void, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const tempPath = pathWithSuffix(
        filePath,
        `.tmp.${Bun.nanoseconds()}.${Math.random().toString(36).slice(2, 8)}`
      );

      yield* fs.writeFileString(tempPath, content);
      yield* fs.rename(tempPath, filePath);
    })
  ).pipe(Effect.mapError((e) => fileWriteError(filePath, e)));

// ============================================================================
// File Operations
// ============================================================================

export const fileExists = (path: AbsolutePath): Effect.Effect<boolean, never> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.exists(path);
    })
  ).pipe(Effect.catchAll(() => Effect.succeed(false)));

export const isDirectory = (path: string): Effect.Effect<boolean, never> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const exists = yield* fs.exists(path);
      const checkStat: Effect.Effect<boolean, PlatformError> = pipe(
        fs.stat(path),
        Effect.map((stat) => stat.type === "Directory"),
        Effect.catchAll(() => Effect.succeed(false))
      );
      const returnFalse: Effect.Effect<boolean, PlatformError> = Effect.succeed(false);
      return yield* Effect.if(exists, {
        onTrue: (): Effect.Effect<boolean, PlatformError> => checkStat,
        onFalse: (): Effect.Effect<boolean, PlatformError> => returnFalse,
      });
    })
  ).pipe(Effect.catchAll(() => Effect.succeed(false)));

export const directoryExists = (path: AbsolutePath): Effect.Effect<boolean, never> =>
  isDirectory(path);

export const copyFile = (
  source: AbsolutePath,
  dest: AbsolutePath
): Effect.Effect<void, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.copy(source, dest);
    })
  ).pipe(
    Effect.mapError(
      (e) =>
        new SystemError({
          code: ErrorCode.FILE_WRITE_FAILED,
          message: `Failed to copy file from ${source} to ${dest}: ${errorMessage(e)}`,
          ...(e instanceof Error ? { cause: e } : {}),
        })
    )
  );

/** Creates .bak alongside original. Pair with copyFile for rollback on failure. */
export const backupFile = (filePath: AbsolutePath): Effect.Effect<AbsolutePath, SystemError> =>
  Effect.gen(function* () {
    const backupPath = pathWithSuffix(filePath, ".bak");
    yield* copyFile(filePath, backupPath);
    return backupPath;
  });

export const renameFile = (
  source: AbsolutePath,
  dest: AbsolutePath
): Effect.Effect<void, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.rename(source, dest);
    })
  ).pipe(
    Effect.mapError(
      (e) =>
        new SystemError({
          code: ErrorCode.FILE_WRITE_FAILED,
          message: `Failed to rename ${source} to ${dest}: ${errorMessage(e)}`,
          ...(e instanceof Error ? { cause: e } : {}),
        })
    )
  );

export const filesEqual = (
  path1: AbsolutePath,
  path2: AbsolutePath
): Effect.Effect<boolean, SystemError> =>
  Effect.gen(function* () {
    const [content1, content2] = yield* Effect.all([readFile(path1), readFile(path2)]);
    return content1 === content2;
  });

export const getFileSize = (path: AbsolutePath): Effect.Effect<number, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const stat = yield* fs.stat(path);
      return Number(stat.size);
    })
  ).pipe(Effect.mapError((e) => fileReadError(path, e)));

/** Idempotent: succeeds whether file existed or not. Safe for rollback cleanup. */
export const deleteFile = (path: AbsolutePath): Effect.Effect<void, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const exists = yield* fs.exists(path);

      const removeEffect: Effect.Effect<void, PlatformError> = fs.remove(path);
      const voidEffect: Effect.Effect<void, PlatformError> = Effect.void;
      yield* Effect.if(exists, {
        onTrue: (): Effect.Effect<void, PlatformError> => removeEffect,
        onFalse: (): Effect.Effect<void, PlatformError> => voidEffect,
      });
    })
  ).pipe(Effect.mapError((e) => fileWriteError(path, e)));

/** Returns true if deleted, false if already absent. For conditional cleanup. */
export const deleteFileIfExists = (path: AbsolutePath): Effect.Effect<boolean, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const exists = yield* fs.exists(path);

      const removeAndReturnTrue: Effect.Effect<boolean, PlatformError> = pipe(
        fs.remove(path),
        Effect.as(true)
      );
      const returnFalse: Effect.Effect<boolean, PlatformError> = Effect.succeed(false);
      return yield* Effect.if(exists, {
        onTrue: (): Effect.Effect<boolean, PlatformError> => removeAndReturnTrue,
        onFalse: (): Effect.Effect<boolean, PlatformError> => returnFalse,
      });
    })
  ).pipe(Effect.mapError((e) => fileWriteError(path, e)));

// ============================================================================
// Directory Operations
// ============================================================================

/** Idempotent: succeeds whether directory exists or was created. */
export const ensureDirectory = (path: AbsolutePath): Effect.Effect<void, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(path, { recursive: true });
    })
  ).pipe(Effect.mapError((e) => directoryError(path, e)));

export const listDirectory = (path: AbsolutePath): Effect.Effect<readonly string[], SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.readDirectory(path);
    })
  ).pipe(Effect.mapError((e) => fileReadError(path, e)));

export const deleteDirectory = (path: AbsolutePath): Effect.Effect<void, SystemError> =>
  withFS(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(path, { recursive: true });
    })
  ).pipe(
    Effect.mapError(
      (e) =>
        new SystemError({
          code: ErrorCode.DIRECTORY_CREATE_FAILED,
          message: `Failed to delete directory: ${path}: ${errorMessage(e)}`,
          ...(e instanceof Error ? { cause: e } : {}),
        })
    )
  );

// ============================================================================
// Watch Operations
// ============================================================================
// Uses Node.js fs.watch for synchronous cleanup without Effect resource overhead.
// Returns cleanup function instead of Effect.scoped for simpler call-site usage.

export const watchFile = (
  path: AbsolutePath,
  callback: (eventType: string) => void
): (() => void) => {
  const watcher = watch(path, (eventType: string) => {
    callback(eventType);
  });
  return (): void => {
    watcher.close();
  };
};

// ============================================================================
// Glob Operations (Bun-specific)
// ============================================================================

/** Patterns relative to cwd. onlyFiles=true excludes directories. */
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

export const globMatch = (pattern: string, path: string): boolean => {
  const glob = new Glob(pattern);
  return glob.match(path);
};

// ============================================================================
// Hash Operations (Bun-specific)
// ============================================================================
// Fast hashing (Bun.hash): cache invalidation, change detection.
// Cryptographic hashing (CryptoHasher): integrity verification, signatures.

/** Fast non-cryptographic hash for cache keys and change detection. */
export const hashFile = (path: AbsolutePath): Effect.Effect<number | bigint, SystemError> =>
  Effect.map(readFile(path), Bun.hash);

/** Fast non-cryptographic hash for cache keys and change detection. */
export const hashContent = (content: string | Uint8Array): number | bigint => Bun.hash(content);

/** Cryptographic hash for integrity verification. */
export const sha256File = (path: AbsolutePath): Effect.Effect<string, SystemError> =>
  Effect.gen(function* () {
    const bytes = yield* readBytes(path);
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(bytes);
    return hasher.digest("hex");
  });

export type HashAlgorithm = "sha256" | "sha512" | "sha1" | "md5" | "blake2b256" | "blake2b512";

/** Cryptographic hash with algorithm choice for integrity verification. */
export const hashContentWith = (
  content: string | Uint8Array | ArrayBuffer,
  algorithm: HashAlgorithm,
  encoding: "hex" | "base64" = "hex"
): string => {
  const hasher = new Bun.CryptoHasher(algorithm);
  hasher.update(content);
  return hasher.digest(encoding);
};

// ============================================================================
// Utility Operations (Bun-specific)
// ============================================================================

export const objectsEqual = <T>(a: T, b: NoInfer<T>, strict = false): boolean =>
  Bun.deepEquals(a, b, strict);
