// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Systemd systemctl wrapper using Effect for error handling.
 */

import { Effect, Option, pipe } from "effect";
import { ErrorCode, type GeneralError, ServiceError, SystemError } from "../lib/errors";
import { heavyRetrySchedule, isTransientSystemError, systemRetrySchedule } from "../lib/retry";
import type { UserId, Username } from "../lib/types";
import { execAsUser } from "./exec";

export type SystemctlCommand =
  | "start"
  | "stop"
  | "restart"
  | "reload"
  | "enable"
  | "disable"
  | "status"
  | "is-active"
  | "is-enabled"
  | "daemon-reload";

export interface SystemctlOptions {
  user: Username;
  uid: UserId;
}

/**
 * Check if a systemd unit is generated (e.g., by Quadlet).
 */
const isGeneratedUnit = (unit: string, options: SystemctlOptions): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(
      execAsUser(options.user, options.uid, [
        "systemctl",
        "--user",
        "show",
        unit,
        "--property=FragmentPath",
      ])
    );

    if (result._tag === "Left") {
      return false;
    }

    if (result.right.exitCode !== 0) {
      return false;
    }

    const output = result.right.stdout.trim();
    return output.includes("/generator/") || output.includes("/run/");
  });

/**
 * Run a systemctl --user command as a service user.
 */
export const systemctl = (
  cmd: SystemctlCommand,
  unit: string | null,
  options: SystemctlOptions
): Effect.Effect<string, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const args = unit ? ["systemctl", "--user", cmd, unit] : ["systemctl", "--user", cmd];

    const result = yield* execAsUser(options.user, options.uid, args, {
      captureStdout: true,
      captureStderr: true,
    });

    // For commands like is-active, non-zero exit code is informational, not an error
    if (cmd === "is-active" || cmd === "is-enabled" || cmd === "status") {
      return result.stdout.trim();
    }

    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.EXEC_FAILED as 26,
          message: `systemctl ${cmd} ${unit ?? ""} failed: ${result.stderr.trim()}`,
        })
      );
    }

    return result.stdout.trim();
  });

/**
 * Start a systemd user service.
 */
export const startService = (
  unit: string,
  options: SystemctlOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* systemctl("start", unit, options);
  }).pipe(
    Effect.retry({
      schedule: heavyRetrySchedule,
      while: (err): boolean => isTransientSystemError(err),
    }),
    Effect.mapError(
      (err) =>
        new ServiceError({
          code: ErrorCode.SERVICE_START_FAILED as 31,
          message: `Failed to start ${unit}: ${err.message}`,
          service: unit,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

/**
 * Stop a systemd user service.
 */
export const stopService = (
  unit: string,
  options: SystemctlOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* systemctl("stop", unit, options);
  }).pipe(
    Effect.retry({
      schedule: systemRetrySchedule,
      while: (err): boolean => isTransientSystemError(err),
    }),
    Effect.mapError(
      (err) =>
        new ServiceError({
          code: ErrorCode.SERVICE_STOP_FAILED as 32,
          message: `Failed to stop ${unit}: ${err.message}`,
          service: unit,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

/**
 * Restart a systemd user service.
 */
export const restartService = (
  unit: string,
  options: SystemctlOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* systemctl("restart", unit, options);
  }).pipe(
    Effect.retry({
      schedule: heavyRetrySchedule,
      while: (err): boolean => isTransientSystemError(err),
    }),
    Effect.mapError(
      (err) =>
        new ServiceError({
          code: ErrorCode.SERVICE_START_FAILED as 31, // No RESTART_FAILED code, using START
          message: `Failed to restart ${unit}: ${err.message}`,
          service: unit,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

/**
 * Reload a systemd user service (if supported).
 */
export const reloadService = (
  unit: string,
  options: SystemctlOptions
): Effect.Effect<void, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* systemctl("reload", unit, options);
  }).pipe(
    Effect.retry({
      schedule: systemRetrySchedule,
      while: (err): boolean => isTransientSystemError(err),
    }),
    Effect.mapError(
      (err) =>
        new ServiceError({
          code: ErrorCode.SERVICE_RELOAD_FAILED as 35,
          message: `Failed to reload ${unit}: ${err.message}`,
          service: unit,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );

/**
 * Enable a systemd user service.
 * Skips generated units (Quadlet) as they're auto-enabled.
 */
export const enableService = (
  unit: string,
  options: SystemctlOptions
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const isGenerated = yield* isGeneratedUnit(unit, options);
    if (isGenerated) {
      return;
    }

    yield* systemctl("enable", unit, options).pipe(
      Effect.retry({
        schedule: systemRetrySchedule,
        while: (err): boolean => isTransientSystemError(err),
      })
    );
  });

/**
 * Disable a systemd user service.
 */
export const disableService = (
  unit: string,
  options: SystemctlOptions
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* systemctl("disable", unit, options).pipe(
      Effect.retry({
        schedule: systemRetrySchedule,
        while: (err): boolean => isTransientSystemError(err),
      })
    );
  });

/**
 * Check if a service is active.
 */
export const isServiceActive = (
  unit: string,
  options: SystemctlOptions
): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(systemctl("is-active", unit, options));
    return result._tag === "Right" && result.right === "active";
  });

/**
 * Check if a service is enabled.
 */
export const isServiceEnabled = (
  unit: string,
  options: SystemctlOptions
): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(systemctl("is-enabled", unit, options));
    return result._tag === "Right" && result.right === "enabled";
  });

/**
 * Get service status output.
 */
export const getServiceStatus = (
  unit: string,
  options: SystemctlOptions
): Effect.Effect<string, SystemError | GeneralError> => systemctl("status", unit, options);

/**
 * Reload systemd daemon to pick up new unit files.
 */
export const daemonReload = (
  options: SystemctlOptions
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* systemctl("daemon-reload", null, options).pipe(
      Effect.retry({
        schedule: heavyRetrySchedule,
        while: (err): boolean => isTransientSystemError(err),
      })
    );
  });

/**
 * Stream logs from journalctl.
 */
export const journalctl = (
  unit: string,
  options: SystemctlOptions & { follow?: boolean; lines?: number }
): Effect.Effect<void, never> =>
  Effect.promise(async () => {
    const args: readonly string[] = [
      "journalctl",
      "--user",
      "-u",
      unit,
      ...pipe(
        Option.fromNullable(options.lines),
        Option.map((n): readonly string[] => ["-n", String(n)]),
        Option.getOrElse((): readonly string[] => [])
      ),
      ...(options.follow ? ["-f" as const] : []),
    ];

    const proc = Bun.spawn(["sudo", "-u", options.user, ...args], {
      env: {
        ...Bun.env,
        XDG_RUNTIME_DIR: `/run/user/${options.uid}`,
      },
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });

    await proc.exited;
  });
