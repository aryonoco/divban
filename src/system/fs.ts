/**
 * Filesystem operations with Result-based error handling.
 * Wraps Bun.file and Bun.write with proper error handling.
 */

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
  if (!result.ok) return result;

  return Ok(
    result.value
      .split("\n")
      .map((line) => line.trimEnd())
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
export const fileExists = async (path: AbsolutePath): Promise<boolean> => {
  return Bun.file(path).exists();
};

/**
 * Check if a path is a directory.
 */
export const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const stat = await Bun.file(path).stat();
    return stat !== null;
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
  if (!content.ok) return content;

  return writeFile(dest, content.value);
};

/**
 * Create a backup of a file (adds .bak extension).
 */
export const backupFile = async (path: AbsolutePath): Promise<Result<AbsolutePath, DivbanError>> => {
  const backupPath = `${path}.bak` as AbsolutePath;
  const result = await copyFile(path, backupPath);
  if (!result.ok) return result;

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
 */
export const atomicWrite = async (
  path: AbsolutePath,
  content: string
): Promise<Result<void, DivbanError>> => {
  const tempPath = `${path}.tmp.${Date.now()}` as AbsolutePath;

  const writeResult = await writeFile(tempPath, content);
  if (!writeResult.ok) return writeResult;

  return tryCatch(
    async () => {
      // Use Bun.spawn for mv since Bun doesn't have rename
      const proc = Bun.spawn(["mv", tempPath, path]);
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error(`Failed to rename temp file`);
      }
    },
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

  if (!content1.ok) return content1;
  if (!content2.ok) return content2;

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
 */
export const directoryExists = async (path: AbsolutePath): Promise<boolean> => {
  try {
    const proc = Bun.spawn(["test", "-d", path]);
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
};

/**
 * Ensure a directory exists (mkdir -p).
 */
export const ensureDirectory = async (
  path: AbsolutePath
): Promise<Result<void, DivbanError>> => {
  return tryCatch(
    async () => {
      const proc = Bun.spawn(["mkdir", "-p", path]);
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error(`mkdir -p failed with exit code ${exitCode}`);
      }
    },
    (e) => wrapError(e, ErrorCode.DIRECTORY_CREATE_FAILED, `Failed to create directory: ${path}`)
  );
};
