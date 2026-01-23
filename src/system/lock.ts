// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Cross-process locks for UID allocation and subid configuration.
 * Uses O_EXCL (exclusive create) for atomic lock acquisition - the
 * kernel guarantees only one process succeeds. Stale locks from
 * crashed processes are detected via PID liveness and timestamp.
 */

import { Effect, Either, Option, Schedule, pipe } from "effect";
import { ErrorCode, GeneralError, SystemError } from "../lib/errors";
import { pollingSchedule } from "../lib/retry";
import { path, type AbsolutePath, pathJoin, pathWithSuffix } from "../lib/types";
import {
  deleteFile,
  ensureDirectory,
  readFile,
  renameFile,
  writeFile,
  writeFileExclusive,
} from "./fs";

const LOCK_DIR = path("/var/lock/divban");
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
 */
const parseLockContent = (content: string): Option.Option<LockInfo> => {
  const lines = content.trim().split("\n");
  const pid = Number.parseInt(lines[0] ?? "", 10);
  const timestamp = Number.parseInt(lines[1] ?? "", 10);

  return Number.isNaN(pid) || Number.isNaN(timestamp)
    ? Option.none()
    : Option.some({ pid, timestamp });
};

/**
 * Check if a process is alive.
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
 */
const isInfoStale = (info: LockInfo): boolean =>
  Date.now() - info.timestamp > STALE_LOCK_AGE_MS || !isProcessAlive(info.pid);

/**
 * Check if a lock file is stale.
 */
const isLockStale = (lockPath: AbsolutePath): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const contentResult = yield* Effect.either(readFile(lockPath));
    return Either.match(contentResult, {
      onLeft: (): boolean => true,
      onRight: (content): boolean =>
        Option.match(parseLockContent(content), {
          onNone: (): boolean => true,
          onSome: isInfoStale,
        }),
    });
  });

/** Lock busy error (retryable) */
class LockBusyError extends Error {
  readonly _tag = "LockBusyError" as const;
  constructor(resourceName: string) {
    super(`Lock '${resourceName}' is busy`);
    this.name = "LockBusyError";
  }
}

/**
 * Atomically take over a stale lock using rename.
 */
const takeoverStaleLock = (
  lockPath: AbsolutePath,
  _resourceName: string
): Effect.Effect<boolean, SystemError> =>
  Effect.gen(function* () {
    const pidContent = `${process.pid}\n${Date.now()}\n`;
    const tempPath = pathWithSuffix(lockPath, `.${process.pid}.tmp`);

    // Write our PID to temp file
    const writeResult = yield* Effect.either(writeFile(tempPath, pidContent));
    type TakeoverResult = Effect.Effect<boolean, SystemError>;
    return yield* Either.match(writeResult, {
      onLeft: (err): TakeoverResult => Effect.fail(err),
      onRight: (): TakeoverResult =>
        // Use ensuring to guarantee temp file cleanup
        Effect.ensuring(
          Effect.gen(function* () {
            // Re-read current lock to verify it's still stale
            const currentContent = yield* Effect.either(readFile(lockPath));
            type InnerResult = Effect.Effect<boolean, never>;
            return yield* Either.match(currentContent, {
              onLeft: (): InnerResult => Effect.succeed(false),
              onRight: (content): InnerResult => {
                const stillStale = Option.match(parseLockContent(content), {
                  onNone: (): boolean => true,
                  onSome: isInfoStale,
                });

                return Effect.gen(function* () {
                  return yield* pipe(stillStale, (isStale) =>
                    isStale
                      ? Effect.gen(function* () {
                          // Atomic rename to take over the lock
                          const renameResult = yield* Effect.either(renameFile(tempPath, lockPath));
                          return Either.isRight(renameResult);
                        })
                      : Effect.succeed(false)
                  );
                });
              },
            });
          }),
          // Cleanup: delete temp file if it still exists (rename succeeded = no file)
          deleteFile(tempPath).pipe(Effect.ignore)
        ),
    });
  });

/**
 * Single attempt to acquire a lock.
 */
const tryAcquireLock = (
  lockPath: AbsolutePath,
  resourceName: string
): Effect.Effect<boolean, SystemError | LockBusyError> =>
  Effect.gen(function* () {
    const pidContent = `${process.pid}\n${Date.now()}\n`;
    const result = yield* writeFileExclusive(lockPath, pidContent);

    return yield* Option.match(result, {
      onSome: (): Effect.Effect<boolean, SystemError | LockBusyError> => Effect.succeed(true),
      onNone: (): Effect.Effect<boolean, SystemError | LockBusyError> =>
        Effect.gen(function* () {
          // Lock file exists - check if stale
          const stale = yield* isLockStale(lockPath);
          if (stale) {
            const takeoverResult = yield* takeoverStaleLock(lockPath, resourceName);
            if (takeoverResult) {
              return true;
            }
          }
          return yield* Effect.fail(new LockBusyError(resourceName));
        }),
    });
  });

/**
 * Execute an operation with an exclusive lock.
 */
export const withLock = <T, E>(
  resourceName: string,
  operation: Effect.Effect<T, E>,
  options: { maxWaitMs?: number; retryIntervalMs?: number } = {}
): Effect.Effect<T, E | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { maxWaitMs = 5000, retryIntervalMs = 50 } = options;

    if (!isValidResourceName(resourceName)) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Invalid lock resource name: ${resourceName}. Must not contain path separators or traversal sequences.`,
        })
      );
    }

    const lockPath = pathJoin(LOCK_DIR, `${resourceName}.lock`);

    // Ensure lock directory exists
    yield* ensureDirectory(LOCK_DIR).pipe(
      Effect.mapError(
        (e) =>
          new SystemError({
            code: ErrorCode.DIRECTORY_CREATE_FAILED as 22,
            message: `Failed to create lock directory ${LOCK_DIR}: ${e.message}`,
            cause: e,
          })
      )
    );

    // Acquire lock with retry
    const retrySchedule = pipe(
      pollingSchedule(maxWaitMs, retryIntervalMs),
      Schedule.whileInput((err: SystemError | LockBusyError) => err instanceof LockBusyError)
    );

    yield* tryAcquireLock(lockPath, resourceName).pipe(
      Effect.retry(retrySchedule),
      Effect.catchTag("LockBusyError", () =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `Timeout acquiring lock '${resourceName}' after ${maxWaitMs}ms. Another divban process may be running.`,
          })
        )
      )
    );

    // Execute operation with guaranteed lock release
    return yield* Effect.ensuring(operation, deleteFile(lockPath).pipe(Effect.ignore));
  });
