// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * User linger enables systemd user services to persist without login.
 * Without linger, user services stop when the last session ends.
 * Also starts user@<uid>.service explicitly for WSL compatibility.
 */

import { Array as Arr, Effect, Either, pipe } from "effect";
import { ErrorCode, GeneralError, SystemError } from "../lib/errors";
import { SYSTEM_PATHS, lingerFile } from "../lib/paths";
import {
  heavyRetrySchedule,
  isTransientSystemError,
  pollingSchedule,
  systemRetrySchedule,
} from "../lib/retry";
import type { ServiceName, UserId, Username } from "../lib/types";
import type { Acquired } from "../services/helpers";
import { exec, execSuccess } from "./exec";
import { fileExists } from "./fs";

/**
 * Start the systemd user service for a user.
 * On some systems (like WSL), enabling linger doesn't automatically start the user session.
 * This is idempotent - if the service is already running, it's a no-op.
 */
const startUserService = (uid: UserId): Effect.Effect<void, SystemError | GeneralError> =>
  execSuccess(["systemctl", "start", `user@${uid}.service`]).pipe(
    Effect.retry({
      schedule: heavyRetrySchedule,
      while: (err): boolean => isTransientSystemError(err),
    }),
    Effect.map(() => undefined),
    Effect.mapError(
      (err) =>
        new SystemError({
          code: ErrorCode.LINGER_ENABLE_FAILED,
          message: `Failed to start user service for uid ${uid}: ${err.message}`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

/**
 * Check if user session socket exists.
 * Fails if socket not found (for retry).
 */
const checkUserSessionSocket = (uid: UserId): Effect.Effect<void, SystemError> =>
  Effect.gen(function* () {
    const { existsSync } = yield* Effect.promise(() => import("node:fs"));
    const socketPath = `/run/user/${uid}/bus`;
    yield* pipe(
      Effect.succeed(existsSync(socketPath)),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        () =>
          new SystemError({
            code: ErrorCode.LINGER_ENABLE_FAILED,
            message: `User session socket not ready at ${socketPath}`,
          })
      )
    );
  });

/**
 * Wait for the systemd user session to be ready.
 * Uses Effect.retry with polling schedule instead of manual loop.
 */
const waitForUserSession = (
  uid: UserId,
  maxWaitMs = 30000,
  intervalMs = 100
): Effect.Effect<boolean, never> =>
  checkUserSessionSocket(uid).pipe(
    Effect.retry(pollingSchedule(maxWaitMs, intervalMs)),
    Effect.as(true),
    Effect.orElseSucceed(() => false)
  );

/**
 * Check if linger is enabled for a user.
 */
export const isLingerEnabled = (username: Username): Effect.Effect<boolean, never> =>
  fileExists(lingerFile(username));

/** Ensure session is ready, fail if not */
const ensureSessionReady = (
  username: Username,
  uid: UserId
): Effect.Effect<void, SystemError | GeneralError> =>
  pipe(
    startUserService(uid),
    Effect.flatMap(() => waitForUserSession(uid)),
    Effect.filterOrFail(
      (ready): ready is true => ready === true,
      () =>
        new SystemError({
          code: ErrorCode.LINGER_ENABLE_FAILED,
          message: `User session not ready for ${username} after enabling linger`,
        })
    ),
    Effect.asVoid
  );

/** Perform the actual linger enable and verify */
const doEnableLinger = (
  username: Username,
  uid: UserId
): Effect.Effect<void, SystemError | GeneralError> =>
  pipe(
    execSuccess(["loginctl", "enable-linger", username]).pipe(
      Effect.retry({
        schedule: heavyRetrySchedule,
        while: (err): boolean => isTransientSystemError(err),
      }),
      Effect.mapError(
        (err) =>
          new SystemError({
            code: ErrorCode.LINGER_ENABLE_FAILED,
            message: `Failed to enable linger for ${username}: ${err.message}`,
            ...(err instanceof Error ? { cause: err } : {}),
          })
      )
    ),
    // Verify it was enabled
    Effect.flatMap(() =>
      pipe(
        isLingerEnabled(username),
        Effect.filterOrFail(
          (enabled): enabled is true => enabled === true,
          () =>
            new SystemError({
              code: ErrorCode.LINGER_ENABLE_FAILED,
              message: `Linger was not enabled for ${username} despite successful command`,
            })
        )
      )
    ),
    // Start user service and wait for session
    Effect.flatMap(() => ensureSessionReady(username, uid))
  );

/**
 * Enable linger for a user.
 * This allows their systemd user services to run without an active login session.
 */
export const enableLinger = (
  username: Username,
  uid: UserId
): Effect.Effect<void, SystemError | GeneralError> =>
  pipe(
    isLingerEnabled(username),
    Effect.flatMap((alreadyEnabled) =>
      Effect.if(alreadyEnabled, {
        onTrue: (): Effect.Effect<void, SystemError | GeneralError> =>
          ensureSessionReady(username, uid),
        onFalse: (): Effect.Effect<void, SystemError | GeneralError> =>
          doEnableLinger(username, uid),
      })
    )
  );

/**
 * Disable linger for a user.
 */
export const disableLinger = (
  username: Username
): Effect.Effect<void, SystemError | GeneralError> =>
  pipe(
    isLingerEnabled(username),
    Effect.flatMap((enabled) =>
      Effect.if(enabled, {
        onTrue: (): Effect.Effect<void, SystemError | GeneralError> =>
          execSuccess(["loginctl", "disable-linger", username]).pipe(
            Effect.retry({
              schedule: systemRetrySchedule,
              while: (err): boolean => isTransientSystemError(err),
            }),
            Effect.mapError(
              (err) =>
                new GeneralError({
                  code: ErrorCode.GENERAL_ERROR,
                  message: `Failed to disable linger for ${username}: ${err.message}`,
                  ...(err instanceof Error ? { cause: err } : {}),
                })
            ),
            Effect.asVoid
          ),
        onFalse: (): Effect.Effect<void, SystemError | GeneralError> => Effect.void,
      })
    )
  );

/**
 * Get list of users with linger enabled.
 */
export const getLingeringUsers = (): Effect.Effect<string[], never> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(
      exec(["ls", SYSTEM_PATHS.lingerDir], { captureStdout: true })
    );

    return Either.match(result, {
      onLeft: (): string[] => [],
      onRight: (r): string[] =>
        r.exitCode !== 0
          ? []
          : pipe(
              r.stdout.split("\n"),
              Arr.map((line) => line.trim()),
              Arr.filter((line) => line.length > 0)
            ),
    });
  });

/**
 * Ensure linger is enabled for a service user, with proper error context.
 */
export const ensureLinger = (
  username: Username,
  uid: UserId,
  serviceName: ServiceName
): Effect.Effect<void, SystemError | GeneralError> =>
  enableLinger(username, uid).pipe(
    Effect.mapError(
      (err) =>
        new SystemError({
          code: ErrorCode.LINGER_ENABLE_FAILED,
          message: `Failed to enable linger for service ${serviceName} (user: ${username})`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

// --- Tracked linger operations ---

/**
 * Enable linger with tracking.
 * Returns Acquired<void> with wasCreated for rollback decision.
 */
export const enableLingerTracked = (
  username: Username,
  uid: UserId
): Effect.Effect<Acquired<void>, SystemError | GeneralError> =>
  pipe(
    isLingerEnabled(username),
    Effect.flatMap((alreadyEnabled) =>
      alreadyEnabled
        ? pipe(
            // Already enabled - ensure session ready, mark as not created by us
            startUserService(uid),
            Effect.flatMap(() => waitForUserSession(uid)),
            Effect.flatMap((ready) =>
              ready
                ? Effect.succeed({ value: undefined, wasCreated: false } as Acquired<void>)
                : Effect.fail(
                    new SystemError({
                      code: ErrorCode.LINGER_ENABLE_FAILED,
                      message: `User session not ready for ${username}`,
                    })
                  )
            )
          )
        : pipe(
            // Not enabled - enable it, mark as created by us
            enableLinger(username, uid),
            Effect.as({ value: undefined, wasCreated: true } as Acquired<void>)
          )
    )
  );
