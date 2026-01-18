/**
 * Filesystem operations with Result-based error handling.
 * Uses Bun.file, Bun.write, Bun.Glob, and node:fs for optimal performance.
 */

import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { Glob } from "bun";
import { DivbanError, ErrorCode, wrapError } from "../lib/errors";
import { Err, Ok, type Result, tryCatch } from "../lib/result";
import type { AbsolutePath } from "../lib/types";

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
  const result = await readFile(path);
  if (!result.ok) {
    return result;
  }

  return Ok(result.value.split("\n").map((line) => line.trimEnd()));
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
 * Append content to a file.
 */
export const appendFile = async (
  path: AbsolutePath,
  content: string
): Promise<Result<void, DivbanError>> => {
  const existingResult = await readFile(path);
  const existing = existingResult.ok ? existingResult.value : "";

  return writeFile(path, existing + content);
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
 * Copy a file.
 */
export const copyFile = async (
  source: AbsolutePath,
  dest: AbsolutePath
): Promise<Result<void, DivbanError>> => {
  const content = await readFile(source);
  if (!content.ok) {
    return content;
  }

  return writeFile(dest, content.value);
};

/**
 * Create a backup of a file (adds .bak extension).
 */
export const backupFile = async (
  path: AbsolutePath
): Promise<Result<AbsolutePath, DivbanError>> => {
  const backupPath = `${path}.bak` as AbsolutePath;
  const result = await copyFile(path, backupPath);
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
  path: AbsolutePath,
  content: string
): Promise<Result<void, DivbanError>> => {
  const tempPath = `${path}.tmp.${Date.now()}` as AbsolutePath;

  const writeResult = await writeFile(tempPath, content);
  if (!writeResult.ok) {
    return writeResult;
  }

  return tryCatch(
    () => rename(tempPath, path),
    (e) => wrapError(e, ErrorCode.FILE_WRITE_FAILED, `Failed to atomically write: ${path}`)
  );
};

/**
 * Compare two files for equality.
 */
export const filesEqual = async (
  path1: AbsolutePath,
  path2: AbsolutePath
): Promise<Result<boolean, DivbanError>> => {
  const [content1, content2] = await Promise.all([readFile(path1), readFile(path2)]);

  if (!content1.ok) {
    return content1;
  }
  if (!content2.ok) {
    return content2;
  }

  return Ok(content1.value === content2.value);
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
 * Uses node:fs stat for synchronous check without subprocess.
 */
export const directoryExists = async (path: AbsolutePath): Promise<boolean> => {
  try {
    const s = await stat(path);
    return s.isDirectory();
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
 * Uses node:fs readdir.
 */
export const listDirectory = async (path: AbsolutePath): Promise<Result<string[], DivbanError>> => {
  return tryCatch(
    () => readdir(path),
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
