/**
 * Systemd systemctl wrapper for user services.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { Err, Ok, type Result } from "../lib/result";
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
 * Run a systemctl --user command as a service user.
 */
export const systemctl = async (
  cmd: SystemctlCommand,
  unit: string | null,
  options: SystemctlOptions
): Promise<Result<string, DivbanError>> => {
  const args = unit ? ["systemctl", "--user", cmd, unit] : ["systemctl", "--user", cmd];

  const result = await execAsUser(options.user, options.uid, args, {
    captureStdout: true,
    captureStderr: true,
  });

  if (!result.ok) {
    return result;
  }

  // For commands like is-active, non-zero exit code is informational, not an error
  if (cmd === "is-active" || cmd === "is-enabled" || cmd === "status") {
    return Ok(result.value.stdout.trim());
  }

  if (result.value.exitCode !== 0) {
    return Err(
      new DivbanError(
        ErrorCode.EXEC_FAILED,
        `systemctl ${cmd} ${unit ?? ""} failed: ${result.value.stderr.trim()}`
      )
    );
  }

  return Ok(result.value.stdout.trim());
};

/**
 * Start a systemd user service.
 */
export const startService = async (
  unit: string,
  options: SystemctlOptions
): Promise<Result<void, DivbanError>> => {
  const result = await systemctl("start", unit, options);
  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_START_FAILED,
        `Failed to start ${unit}: ${result.error.message}`,
        result.error
      )
    );
  }
  return Ok(undefined);
};

/**
 * Stop a systemd user service.
 */
export const stopService = async (
  unit: string,
  options: SystemctlOptions
): Promise<Result<void, DivbanError>> => {
  const result = await systemctl("stop", unit, options);
  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_STOP_FAILED,
        `Failed to stop ${unit}: ${result.error.message}`,
        result.error
      )
    );
  }
  return Ok(undefined);
};

/**
 * Restart a systemd user service.
 */
export const restartService = async (
  unit: string,
  options: SystemctlOptions
): Promise<Result<void, DivbanError>> => {
  const result = await systemctl("restart", unit, options);
  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Failed to restart ${unit}: ${result.error.message}`,
        result.error
      )
    );
  }
  return Ok(undefined);
};

/**
 * Reload a systemd user service (if supported).
 */
export const reloadService = async (
  unit: string,
  options: SystemctlOptions
): Promise<Result<void, DivbanError>> => {
  const result = await systemctl("reload", unit, options);
  if (!result.ok) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_RELOAD_FAILED,
        `Failed to reload ${unit}: ${result.error.message}`,
        result.error
      )
    );
  }
  return Ok(undefined);
};

/**
 * Enable a systemd user service.
 */
export const enableService = async (
  unit: string,
  options: SystemctlOptions
): Promise<Result<void, DivbanError>> => {
  const result = await systemctl("enable", unit, options);
  if (!result.ok) {
    return Err(result.error);
  }
  return Ok(undefined);
};

/**
 * Disable a systemd user service.
 */
export const disableService = async (
  unit: string,
  options: SystemctlOptions
): Promise<Result<void, DivbanError>> => {
  const result = await systemctl("disable", unit, options);
  if (!result.ok) {
    return Err(result.error);
  }
  return Ok(undefined);
};

/**
 * Check if a service is active.
 */
export const isServiceActive = async (
  unit: string,
  options: SystemctlOptions
): Promise<boolean> => {
  const result = await systemctl("is-active", unit, options);
  return result.ok && result.value === "active";
};

/**
 * Check if a service is enabled.
 */
export const isServiceEnabled = async (
  unit: string,
  options: SystemctlOptions
): Promise<boolean> => {
  const result = await systemctl("is-enabled", unit, options);
  return result.ok && result.value === "enabled";
};

/**
 * Get service status output.
 */
export const getServiceStatus = (
  unit: string,
  options: SystemctlOptions
): Promise<Result<string, DivbanError>> => {
  return systemctl("status", unit, options);
};

/**
 * Reload systemd daemon to pick up new unit files.
 */
export const daemonReload = async (
  options: SystemctlOptions
): Promise<Result<void, DivbanError>> => {
  const result = await systemctl("daemon-reload", null, options);
  if (!result.ok) {
    return Err(result.error);
  }
  return Ok(undefined);
};

/**
 * Stream logs from journalctl.
 */
export const journalctl = async (
  unit: string,
  options: SystemctlOptions & { follow?: boolean; lines?: number }
): Promise<Result<void, DivbanError>> => {
  const args = ["journalctl", "--user", "-u", unit];

  if (options.lines !== undefined) {
    args.push("-n", String(options.lines));
  }

  if (options.follow) {
    args.push("-f");
  }

  // For follow mode, we run interactively
  const proc = Bun.spawn(["sudo", "-u", options.user, ...args], {
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: `/run/user/${options.uid}`,
    },
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  await proc.exited;
  return Ok(undefined);
};
