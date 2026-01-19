// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Filesystem operations with Result-based error handling.
 * Uses Bun.file, Bun.write, Bun.Glob, and node:fs for optimal performance.
 */

import { watch } from "node:fs";
import { mkdir, writeFile as nodeWriteFile, rename } from "node:fs/promises";
import { type FileSink, Glob } from "bun";
import { DivbanError, ErrorCode, wrapError } from "../lib/errors";
import { None, type Option, Some } from "../lib/option";
import {
  Err,
  Ok,
  type Result,
  asyncFlatMapResult,
  mapResult,
  parallel,
  tryCatch,
} from "../lib/result";
import { type AbsolutePath, pathWithSuffix } from "../lib/types";

/**
 * Read file contents as text.
 */
export const readFile = async (path: AbsolutePath): Promise<Result<string, DivbanError>> => {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return Err(new DivbanError(ErrorCode.FILE_READ_FAILED, `File not found: ${path}`));
  }

  return tryCatch(
    () => file.text(),
    (e) => wrapError(e, ErrorCode.FILE_READ_FAILED, `Failed to read file: ${path}`)
  );
};

/**
 * Read file contents as lines.
 */
export const readLines = async (path: AbsolutePath): Promise<Result<string[], DivbanError>> => {
  return mapResult(await readFile(path), (content) =>
    content.split("\n").map((line) => line.trimEnd())
  );
};

/**
 * Write content to a file.
 */
export const writeFile = async (
  path: AbsolutePath,
  content: string
): Promise<Result<void, DivbanError>> => {
  return tryCatch(
    async () => {
      await Bun.write(path, content);
    },
    (e) => wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to write file: ${path}`)
  );
};

/**
 * Create a file exclusively - fails if file already exists.
 * Uses O_CREAT | O_EXCL via 'wx' flag for atomic check-and-create.
 * Returns Ok(Some(undefined)) if created, Ok(None) if file existed.
 * Follows Option semantics: Some = created, None = already existed.
 */
export const writeFileExclusive = async (
  path: AbsolutePath,
  content: string
): Promise<Result<Option<void>, DivbanError>> => {
  try {
    await nodeWriteFile(path, content, { flag: "wx", encoding: "utf8" });
    return Ok(Some(undefined));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      return Ok(None); // File already exists - not an error
    }
    return Err(wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to create ${path}`));
  }
};

/**
 * Create a file writer for incremental writes.
 * Uses Bun's FileSink for optimal streaming performance.
 */
export interface FileWriter {
  writer: FileSink;
  close: () => number | Promise<number>;
}

export const createFileWriter = (path: AbsolutePath): FileWriter => {
  const file = Bun.file(path);
  const writer = file.writer();
  const close = (): number | Promise<number> => writer.end();
  return {
    writer,
    close,
  };
};

/**
 * Append content to a file.
 * Uses Bun's FileSink for optimal performance.
 */
export const appendFile = async (
  path: AbsolutePath,
  content: string
): Promise<Result<void, DivbanError>> => {
  return tryCatch(
    async () => {
      const file = Bun.file(path);
      const writer = file.writer();
      writer.write(content);
      await writer.end();
    },
    (e) => wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to append to file: ${path}`)
  );
};

/**
 * Check if a file exists.
 */
export const fileExists = (path: AbsolutePath): Promise<boolean> => {
  return Bun.file(path).exists();
};

/**
 * Check if a path is a directory.
 */
export const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const s = await Bun.file(path).stat();
    return s?.isDirectory() ?? false;
  } catch {
    return false;
  }
};

/**
 * Copy a file using kernel-level operations.
 * Uses Bun.write(dest, Bun.file(src)) which leverages:
 * - copy_file_range on Linux
 * - clonefile on macOS
 */
export const copyFile = async (
  source: AbsolutePath,
  dest: AbsolutePath
): Promise<Result<void, DivbanError>> => {
  const sourceFile = Bun.file(source);

  if (!(await sourceFile.exists())) {
    return Err(new DivbanError(ErrorCode.FILE_READ_FAILED, `Source file not found: ${source}`));
  }

  return tryCatch(
    async () => {
      await Bun.write(dest, sourceFile);
    },
    (e) =>
      wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to copy file from ${source} to ${dest}`)
  );
};

/**
 * Create a backup of a file (adds .bak extension).
 */
export const backupFile = async (
  filePath: AbsolutePath
): Promise<Result<AbsolutePath, DivbanError>> => {
  const backupPath = pathWithSuffix(filePath, ".bak");
  const result = await copyFile(filePath, backupPath);
  if (!result.ok) {
    return result;
  }

  return Ok(backupPath);
};

/**
 * Read file if it exists, return empty string otherwise.
 */
export const readFileOrEmpty = async (path: AbsolutePath): Promise<string> => {
  const result = await readFile(path);
  return result.ok ? result.value : "";
};

/**
 * Atomically write a file by writing to a temp file first.
 * Uses node:fs rename for atomic move operation.
 */
export const atomicWrite = async (
  filePath: AbsolutePath,
  content: string
): Promise<Result<void, DivbanError>> => {
  const tempPath = pathWithSuffix(
    filePath,
    `.tmp.${Bun.nanoseconds()}.${Math.random().toString(36).slice(2, 8)}`
  );

  return asyncFlatMapResult(await writeFile(tempPath, content), () =>
    tryCatch(
      () => rename(tempPath, filePath),
      (e) => wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to atomically write: ${filePath}`)
    )
  );
};

/**
 * Compare two files for equality.
 */
export const filesEqual = async (
  path1: AbsolutePath,
  path2: AbsolutePath
): Promise<Result<boolean, DivbanError>> => {
  const result = await parallel([readFile(path1), readFile(path2)], (e) =>
    wrapError(e, ErrorCode.FILE_READ_FAILED, "comparing files")
  );
  if (!result.ok) {
    return result;
  }
  const [content1, content2] = result.value;
  return Ok(content1 === content2);
};

/**
 * Get file size in bytes.
 */
export const getFileSize = async (path: AbsolutePath): Promise<Result<number, DivbanError>> => {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return Err(new DivbanError(ErrorCode.FILE_READ_FAILED, `File not found: ${path}`));
  }

  return Ok(file.size);
};

/**
 * Check if a directory exists.
 * Uses Bun.file().stat() for optimal performance.
 */
export const directoryExists = async (path: AbsolutePath): Promise<boolean> => {
  try {
    const file = Bun.file(path);
    const s = await file.stat();
    return s?.isDirectory() ?? false;
  } catch {
    return false;
  }
};

/**
 * Ensure a directory exists (mkdir -p equivalent).
 * Uses node:fs mkdir with recursive option.
 */
export const ensureDirectory = async (path: AbsolutePath): Promise<Result<void, DivbanError>> => {
  return tryCatch(
    () => mkdir(path, { recursive: true }).then(() => undefined),
    (e) => wrapError(e, ErrorCode.DIRECTORY_CREATE_FAILED, `Failed to create directory: ${path}`)
  );
};

/**
 * List files in a directory.
 * Uses Bun.Glob for native file discovery.
 */
export const listDirectory = async (path: AbsolutePath): Promise<Result<string[], DivbanError>> => {
  return tryCatch(
    async () => {
      const glob = new Glob("*");
      const entries: string[] = [];
      for await (const entry of glob.scan({ cwd: path, onlyFiles: false })) {
        entries.push(entry);
      }
      return entries;
    },
    (e) => wrapError(e, ErrorCode.FILE_READ_FAILED, `Failed to list directory: ${path}`)
  );
};

/**
 * Find files matching a glob pattern.
 * Uses Bun.Glob for fast pattern matching.
 */
export const globFiles = async (
  pattern: string,
  options: { cwd?: string; onlyFiles?: boolean } = {}
): Promise<string[]> => {
  const glob = new Glob(pattern);
  const files: string[] = [];

  for await (const file of glob.scan({
    cwd: options.cwd ?? ".",
    onlyFiles: options.onlyFiles ?? true,
  })) {
    files.push(file);
  }

  return files;
};

/**
 * Check if a path matches a glob pattern.
 */
export const globMatch = (pattern: string, path: string): boolean => {
  const glob = new Glob(pattern);
  return glob.match(path);
};

/**
 * Delete a file using Bun's native file.delete() method.
 * Returns success if file was deleted or didn't exist.
 */
export const deleteFile = async (path: AbsolutePath): Promise<Result<void, DivbanError>> => {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return Ok(undefined);
  }

  return tryCatch(
    async () => {
      await file.delete();
    },
    (e) => wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to delete file: ${path}`)
  );
};

/**
 * Delete a file only if it exists.
 * Returns true if file was deleted, false if it didn't exist.
 */
export const deleteFileIfExists = async (
  path: AbsolutePath
): Promise<Result<boolean, DivbanError>> => {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return Ok(false);
  }

  const result = await tryCatch(
    async () => {
      await file.delete();
    },
    (e) => wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to delete file: ${path}`)
  );

  if (!result.ok) {
    return result;
  }
  return Ok(true);
};

/**
 * Hash file contents using Bun.hash() for fast non-cryptographic hashing.
 * Useful for change detection. Returns bigint for xxhash64 (default) or number for xxhash32.
 */
export const hashFile = async (
  path: AbsolutePath
): Promise<Result<number | bigint, DivbanError>> => {
  return mapResult(await readFile(path), Bun.hash);
};

/**
 * Hash content using Bun.hash() for fast non-cryptographic hashing.
 * Returns bigint for xxhash64 (default) or number for xxhash32.
 */
export const hashContent = (content: string | Uint8Array): number | bigint => {
  return Bun.hash(content);
};

/**
 * Compute SHA-256 hash of a file using Bun.CryptoHasher.
 * Useful for cryptographic verification (e.g., backup integrity).
 */
export const sha256File = async (path: AbsolutePath): Promise<Result<string, DivbanError>> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return Err(new DivbanError(ErrorCode.FILE_READ_FAILED, `File not found: ${path}`));
  }

  return tryCatch(
    async () => {
      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(await file.arrayBuffer());
      return hasher.digest("hex");
    },
    (e) => wrapError(e, ErrorCode.FILE_READ_FAILED, `Failed to hash file: ${path}`)
  );
};

/**
 * Deep equality comparison using Bun.deepEquals.
 */
export const objectsEqual = <T>(a: T, b: NoInfer<T>, strict = false): boolean => {
  return Bun.deepEquals(a, b, strict);
};

/**
 * Watch a file for changes using node:fs file watcher.
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

/**
 * Supported hash algorithms for hashContentWith.
 */
export type HashAlgorithm = "sha256" | "sha512" | "sha1" | "md5" | "blake2b256" | "blake2b512";

/**
 * Hash content with a specified algorithm using Bun.CryptoHasher.
 * Supports multiple algorithms for different use cases.
 *
 * @example
 * hashContentWith("hello", "sha256") // "2cf24dba..."
 * hashContentWith(data, "blake2b256") // faster alternative
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
