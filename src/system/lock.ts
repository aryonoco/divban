// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * File-based locking for critical sections.
 * Uses O_EXCL (via writeFileExclusive) for atomic lock acquisition.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { None, type Option, Some, getOrElse, isSome, mapOption } from "../lib/option";
import { Err, Ok, type Result, mapErr, retry } from "../lib/result";
import type { AbsolutePath } from "../lib/types";
import {
  deleteFile,
  ensureDirectory,
  readFile,
  renameFile,
  writeFile,
  writeFileExclusive,
} from "./fs";

const LOCK_DIR = "/var/lock/divban" as AbsolutePath;
const STALE_LOCK_AGE_MS = 60000; // 1 minute

/** Validate resource name doesn't contain path traversal characters */
const isValidResourceName = (name: string): boolean =>
  !(name.includes("/") || name.includes("\\") || name.includes("..") || name.includes("\x00"));

/** Lock file content: PID and timestamp */
interface LockInfo {
  readonly pid: number;
  readonly timestamp: number;
}

/**
 * Parse lock file content into structured form.
 * Returns None for invalid/unreadable content (treat as stale).
 */
const parseLockContent = (content: string): Option<LockInfo> => {
  const lines = content.trim().split("\n");
  const pid = Number.parseInt(lines[0] ?? "", 10);
  const timestamp = Number.parseInt(lines[1] ?? "", 10);

  return Number.isNaN(pid) || Number.isNaN(timestamp) ? None : Some({ pid, timestamp });
};

/**
 * Check if a process is alive (signal 0 doesn't kill, just checks).
 */
const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Determine if lock info represents a stale lock.
 * Stale = too old OR process dead.
 */
const isInfoStale = (info: LockInfo): boolean =>
  Date.now() - info.timestamp > STALE_LOCK_AGE_MS || !isProcessAlive(info.pid);

/**
 * Check if a lock file is stale (process dead, too old, or unreadable).
 * Uses Option composition: unreadable or invalid content = stale (None → true).
 */
const isLockStale = async (lockPath: AbsolutePath): Promise<boolean> => {
  const contentResult = await readFile(lockPath);
  if (!contentResult.ok) {
    return true;
  }

  return getOrElse(
    mapOption(parseLockContent(contentResult.value), isInfoStale),
    true // None (invalid content) → treat as stale
  );
};

/**
 * Atomically take over a stale lock using rename.
 *
 * Algorithm:
 * 1. Write our PID to temp file
 * 2. Re-verify lock is still stale (owner may have refreshed)
 * 3. Atomic rename temp → lock (overwrites stale lock)
 *
 * Returns Ok(true) if takeover succeeded, Ok(false) if lock changed during takeover.
 *
 * FP pattern: asyncFlatMapResult chain with cleanup on all exit paths.
 */
const takeoverStaleLock = async (
  lockPath: AbsolutePath,
  _resourceName: string
): Promise<Result<boolean, DivbanError>> => {
  const pidContent = `${process.pid}\n${Date.now()}\n`;
  const tempPath = `${lockPath}.${process.pid}.tmp` as AbsolutePath;

  const cleanup = (): Promise<Result<void, DivbanError>> => deleteFile(tempPath);

  // Step 1: Write our PID to temp file
  const writeResult = await writeFile(tempPath, pidContent);
  if (!writeResult.ok) {
    return writeResult;
  }

  // Step 2: Re-read current lock to verify it's still stale
  const currentContent = await readFile(lockPath);
  if (!currentContent.ok) {
    // Lock was deleted by another process - clean up and signal retry
    await cleanup();
    return Ok(false);
  }

  // Verify lock is still stale (owner may have refreshed it)
  const stillStale = getOrElse(
    mapOption(parseLockContent(currentContent.value), isInfoStale),
    true // Invalid content = treat as stale
  );

  if (!stillStale) {
    // Lock was refreshed by active process - abort takeover
    await cleanup();
    return Ok(false);
  }

  // Step 3: Atomic rename to take over the lock
  const renameResult = await renameFile(tempPath, lockPath);
  if (!renameResult.ok) {
    // Rename failed (permissions, etc.) - clean up and signal retry
    await cleanup();
    return Ok(false);
  }

  return Ok(true);
};

/** Error indicating lock couldn't be acquired (retryable) */
const lockBusyError = (resourceName: string): DivbanError =>
  new DivbanError(ErrorCode.GENERAL_ERROR, `Lock '${resourceName}' is busy`);

/** Error indicating lock acquisition timed out (not retryable) */
const lockTimeoutError = (resourceName: string, maxWaitMs: number): DivbanError =>
  new DivbanError(
    ErrorCode.GENERAL_ERROR,
    `Timeout acquiring lock '${resourceName}' after ${maxWaitMs}ms. Another divban process may be running.`
  );

/**
 * Single attempt to acquire a lock.
 * Returns Ok(true) if acquired, Err if busy (retryable), or Err for fs errors.
 *
 * Acquisition strategies:
 * 1. Exclusive create (O_EXCL) - fast path for new locks
 * 2. Atomic takeover - for stale locks (dead process, timeout)
 */
const tryAcquireLock = async (
  lockPath: AbsolutePath,
  resourceName: string
): Promise<Result<boolean, DivbanError>> => {
  const pidContent = `${process.pid}\n${Date.now()}\n`;
  const result = await writeFileExclusive(lockPath, pidContent);

  if (!result.ok) {
    return result; // Filesystem error (permissions, disk full, etc.)
  }

  if (isSome(result.value)) {
    return Ok(true); // Lock acquired via exclusive create (fast path)
  }

  // Lock file exists - check if stale
  if (await isLockStale(lockPath)) {
    // Attempt atomic takeover of stale lock
    const takeoverResult = await takeoverStaleLock(lockPath, resourceName);
    if (!takeoverResult.ok) {
      return takeoverResult; // Filesystem error during takeover
    }
    if (takeoverResult.value) {
      return Ok(true); // Successfully took over stale lock
    }
    // Takeover failed (lock refreshed or deleted) - signal retry
  }

  // Lock held by active process
  return Err(lockBusyError(resourceName));
};

/**
 * Execute an operation with an exclusive lock.
 * Uses `retry` combinator for lock acquisition with backoff.
 * Lock is automatically released after operation completes (success or error).
 *
 * @param resourceName - Unique name for the resource being locked
 * @param operation - Async function to execute with lock held
 * @param options - Lock acquisition options
 */
export const withLock = async <T>(
  resourceName: string,
  operation: () => Promise<Result<T, DivbanError>>,
  options: { maxWaitMs?: number; retryIntervalMs?: number } = {}
): Promise<Result<T, DivbanError>> => {
  const { maxWaitMs = 5000, retryIntervalMs = 50 } = options;

  if (!isValidResourceName(resourceName)) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        `Invalid lock resource name: ${resourceName}. Must not contain path separators or traversal sequences.`
      )
    );
  }
  const lockPath = `${LOCK_DIR}/${resourceName}.lock` as AbsolutePath;
  const maxAttempts = Math.ceil(maxWaitMs / retryIntervalMs);

  // Ensure lock directory exists
  const dirResult = await ensureDirectory(LOCK_DIR);
  if (!dirResult.ok) {
    return mapErr(
      dirResult,
      (e) =>
        new DivbanError(
          ErrorCode.DIRECTORY_CREATE_FAILED,
          `Failed to create lock directory ${LOCK_DIR}: ${e.message}`,
          e
        )
    );
  }

  // Acquire lock using retry combinator
  const acquireResult = await retry(
    () => tryAcquireLock(lockPath, resourceName),
    (err) => err.message.includes("is busy"), // Only retry on "busy" errors
    { maxAttempts, baseDelayMs: retryIntervalMs }
  );

  // Map "busy" errors after max retries to timeout error
  if (!acquireResult.ok) {
    return acquireResult.error.message.includes("is busy")
      ? Err(lockTimeoutError(resourceName, maxWaitMs))
      : acquireResult;
  }

  // Execute operation with guaranteed lock release
  try {
    return await operation();
  } finally {
    await deleteFile(lockPath);
  }
};
