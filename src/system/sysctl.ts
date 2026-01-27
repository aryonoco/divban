// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Sysctl for unprivileged port binding (ports 70+).
 * Linux restricts ports < 1024 to root by default. Lowering
 * net.ipv4.ip_unprivileged_port_start lets rootless containers
 * bind HTTP/HTTPS ports without CAP_NET_BIND_SERVICE.
 */

import { Effect, Either, pipe } from "effect";
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
  pipe(
    execOutput(["sysctl", "-n", SYSCTL_KEY]).pipe(
      Effect.mapError(
        (err) =>
          new SystemError({
            code: ErrorCode.EXEC_FAILED,
            message: `Failed to read sysctl ${SYSCTL_KEY}: ${err.message}`,
            ...(err instanceof Error ? { cause: err } : {}),
          })
      )
    ),
    Effect.map((output) => ({ output: output.trim(), value: Number.parseInt(output.trim(), 10) })),
    Effect.filterOrFail(
      ({ value }) => !Number.isNaN(value),
      ({ output }) =>
        new SystemError({
          code: ErrorCode.EXEC_FAILED,
          message: `Invalid sysctl value for ${SYSCTL_KEY}: ${output}`,
        })
    ),
    Effect.map(({ value }) => value)
  );

/**
 * Check if unprivileged port binding is enabled for the given threshold.
 */
export const isUnprivilegedPortEnabled = (
  threshold: number = DEFAULT_UNPRIVILEGED_PORT_START
): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(getUnprivilegedPortStart());
    return Either.match(result, {
      onLeft: (): boolean => false,
      onRight: (value): boolean => value <= threshold,
    });
  });

/** Create sysctl config content */
const sysctlConfigContent = (threshold: number): string =>
  `# Configured by divban for rootless container privileged port binding
# Allows unprivileged users to bind to ports >= ${threshold}
${SYSCTL_KEY} = ${threshold}
`;

/** Perform the actual sysctl configuration */
const doConfigureSysctl = (threshold: number): Effect.Effect<void, SystemError | GeneralError> =>
  pipe(
    // Write persistent configuration
    writeFile(SYSTEM_PATHS.sysctlUnprivilegedPorts, sysctlConfigContent(threshold)).pipe(
      Effect.mapError(
        (err) =>
          new SystemError({
            code: ErrorCode.FILE_WRITE_FAILED,
            message: `Failed to write sysctl configuration: ${err.message}`,
            ...(err instanceof Error ? { cause: err } : {}),
          })
      )
    ),
    // Apply immediately
    Effect.flatMap(() =>
      execSuccess(["sysctl", "-w", `${SYSCTL_KEY}=${threshold}`]).pipe(
        Effect.mapError(
          (err) =>
            new SystemError({
              code: ErrorCode.EXEC_FAILED,
              message: `Failed to apply sysctl ${SYSCTL_KEY}=${threshold}: ${err.message}`,
              ...(err instanceof Error ? { cause: err } : {}),
            })
        )
      )
    ),
    Effect.asVoid
  );

/**
 * Configure unprivileged port start persistently.
 * Writes to /etc/sysctl.d/ and applies immediately. Idempotent.
 */
export const configureUnprivilegedPorts = (
  threshold: number = DEFAULT_UNPRIVILEGED_PORT_START
): Effect.Effect<void, SystemError | GeneralError> =>
  pipe(
    isUnprivilegedPortEnabled(threshold),
    Effect.flatMap((alreadyEnabled) =>
      Effect.if(alreadyEnabled, {
        onTrue: (): Effect.Effect<void, SystemError | GeneralError> => Effect.void,
        onFalse: (): Effect.Effect<void, SystemError | GeneralError> =>
          doConfigureSysctl(threshold),
      })
    )
  );

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
          code: ErrorCode.EXEC_FAILED,
          message: `Failed to configure unprivileged port binding${context}`,
          ...(err instanceof Error ? { cause: err } : {}),
        })
    )
  );
};
