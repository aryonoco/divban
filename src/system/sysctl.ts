// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Sysctl configuration using Effect for error handling.
 * Enables unprivileged users to bind to ports >= configured threshold.
 */

import { Effect } from "effect";
import { ErrorCode, type GeneralError, SystemError } from "../lib/errors";
import { SYSTEM_PATHS } from "../lib/paths";
import { execOutput, execSuccess } from "./exec";
import { writeFile } from "./fs";

/** Default port threshold for unprivileged port binding */
export const DEFAULT_UNPRIVILEGED_PORT_START = 70;

/** Sysctl key for unprivileged port start */
const SYSCTL_KEY = "net.ipv4.ip_unprivileged_port_start";

/**
 * Get current value of net.ipv4.ip_unprivileged_port_start.
 */
export const getUnprivilegedPortStart = (): Effect.Effect<number, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const output = yield* execOutput(["sysctl", "-n", SYSCTL_KEY]).pipe(
      Effect.mapError(
        (err) =>
          new SystemError({
            code: ErrorCode.EXEC_FAILED as 26,
            message: `Failed to read sysctl ${SYSCTL_KEY}: ${err.message}`,
            ...(err instanceof Error ? { cause: err } : {}),
          })
      )
    );

    const value = Number.parseInt(output.trim(), 10);
    if (Number.isNaN(value)) {
      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.EXEC_FAILED as 26,
          message: `Invalid sysctl value for ${SYSCTL_KEY}: ${output}`,
        })
      );
    }

    return value;
  });

/**
 * Check if unprivileged port binding is enabled for the given threshold.
 */
export const isUnprivilegedPortEnabled = (
  threshold: number = DEFAULT_UNPRIVILEGED_PORT_START
): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(getUnprivilegedPortStart());
    if (result._tag === "Left") {
      return false;
    }
    return result.right <= threshold;
  });

/**
 * Configure unprivileged port start persistently.
 * Writes to /etc/sysctl.d/ and applies immediately. Idempotent.
 */
export const configureUnprivilegedPorts = (
  threshold: number = DEFAULT_UNPRIVILEGED_PORT_START
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    // Check if already configured
    const alreadyEnabled = yield* isUnprivilegedPortEnabled(threshold);
    if (alreadyEnabled) {
      return;
    }

    const configContent = `# Configured by divban for rootless container privileged port binding
# Allows unprivileged users to bind to ports >= ${threshold}
${SYSCTL_KEY} = ${threshold}
`;

    // Write persistent configuration
    yield* writeFile(SYSTEM_PATHS.sysctlUnprivilegedPorts, configContent).pipe(
      Effect.mapError(
        (err) =>
          new SystemError({
            code: ErrorCode.FILE_WRITE_FAILED as 28,
            message: `Failed to write sysctl configuration: ${err.message}`,
            ...(err instanceof Error ? { cause: err } : {}),
          })
      )
    );

    // Apply immediately
    yield* execSuccess(["sysctl", "-w", `${SYSCTL_KEY}=${threshold}`]).pipe(
      Effect.mapError(
        (err) =>
          new SystemError({
            code: ErrorCode.EXEC_FAILED as 26,
            message: `Failed to apply sysctl ${SYSCTL_KEY}=${threshold}: ${err.message}`,
            ...(err instanceof Error ? { cause: err } : {}),
          })
      )
    );
  });

/**
 * Ensure unprivileged port binding is configured for a service.
 */
export const ensureUnprivilegedPorts = (
  threshold: number = DEFAULT_UNPRIVILEGED_PORT_START,
  serviceName?: string
): Effect.Effect<void, SystemError | GeneralError> => {
  const context = serviceName ? ` for service ${serviceName}` : "";
  return configureUnprivilegedPorts(threshold).pipe(
    Effect.mapError(
      (err) =>
        new SystemError({
          code: ErrorCode.EXEC_FAILED as 26,
          message: `Failed to configure unprivileged port binding${context}`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );
};
