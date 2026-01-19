// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Sysctl configuration for rootless container privileged port binding.
 * Enables unprivileged users to bind to ports >= configured threshold.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { SYSTEM_PATHS } from "../lib/paths";
import { Err, Ok, type Result, mapErr } from "../lib/result";
import { execOutput, execSuccess } from "./exec";
import { writeFile } from "./fs";

/** Default port threshold for unprivileged port binding */
export const DEFAULT_UNPRIVILEGED_PORT_START = 70;

/** Sysctl key for unprivileged port start */
const SYSCTL_KEY = "net.ipv4.ip_unprivileged_port_start";

/**
 * Get current value of net.ipv4.ip_unprivileged_port_start.
 */
export const getUnprivilegedPortStart = async (): Promise<Result<number, DivbanError>> => {
  const result = await execOutput(["sysctl", "-n", SYSCTL_KEY]);
  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.EXEC_FAILED,
        `Failed to read sysctl ${SYSCTL_KEY}: ${result.error.message}`,
        result.error
      )
    );
  }
  const value = Number.parseInt(result.value.trim(), 10);
  if (Number.isNaN(value)) {
    return Err(
      new DivbanError(
        ErrorCode.EXEC_FAILED,
        `Invalid sysctl value for ${SYSCTL_KEY}: ${result.value}`
      )
    );
  }
  return Ok(value);
};

/**
 * Check if unprivileged port binding is enabled for the given threshold.
 */
export const isUnprivilegedPortEnabled = async (
  threshold: number = DEFAULT_UNPRIVILEGED_PORT_START
): Promise<boolean> => {
  const result = await getUnprivilegedPortStart();
  if (!result.ok) {
    return false;
  }
  return result.value <= threshold;
};

/**
 * Configure unprivileged port start persistently.
 * Writes to /etc/sysctl.d/ and applies immediately. Idempotent.
 */
export const configureUnprivilegedPorts = async (
  threshold: number = DEFAULT_UNPRIVILEGED_PORT_START
): Promise<Result<void, DivbanError>> => {
  // Check if already configured
  if (await isUnprivilegedPortEnabled(threshold)) {
    return Ok(undefined);
  }

  const configContent = `# Configured by divban for rootless container privileged port binding
# Allows unprivileged users to bind to ports >= ${threshold}
${SYSCTL_KEY} = ${threshold}
`;

  // Write persistent configuration
  const writeResult = await writeFile(SYSTEM_PATHS.sysctlUnprivilegedPorts, configContent);
  const writeMapped = mapErr(
    writeResult,
    (err) =>
      new DivbanError(
        ErrorCode.FILE_WRITE_FAILED,
        `Failed to write sysctl configuration: ${err.message}`,
        err
      )
  );
  if (!writeMapped.ok) return writeMapped;

  // Apply immediately
  const applyResult = await execSuccess(["sysctl", "-w", `${SYSCTL_KEY}=${threshold}`]);
  const applyMapped = mapErr(
    applyResult,
    (err) =>
      new DivbanError(
        ErrorCode.EXEC_FAILED,
        `Failed to apply sysctl ${SYSCTL_KEY}=${threshold}: ${err.message}`,
        err
      )
  );
  return applyMapped.ok ? Ok(undefined) : applyMapped;
};

/**
 * Ensure unprivileged port binding is configured for a service.
 */
export const ensureUnprivilegedPorts = async (
  threshold: number = DEFAULT_UNPRIVILEGED_PORT_START,
  serviceName?: string
): Promise<Result<void, DivbanError>> => {
  const context = serviceName ? ` for service ${serviceName}` : "";
  return mapErr(
    await configureUnprivilegedPorts(threshold),
    (err) =>
      new DivbanError(
        ErrorCode.EXEC_FAILED,
        `Failed to configure unprivileged port binding${context}`,
        err
      )
  );
};
