/**
 * Command execution wrapper with Result-based error handling.
 * Uses Bun.spawn for process management.
 */

import { DivbanError, ErrorCode, wrapError } from "../lib/errors";
import { Err, Ok, type Result, tryCatch } from "../lib/result";

export interface ExecOptions {
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Run as specific user (requires root) */
  user?: string;
  /** Capture stdout */
  captureStdout?: boolean;
  /** Capture stderr */
  captureStderr?: boolean;
  /** Pipe stdin */
  stdin?: string;
}

export interface ExecResult {
  /** Exit code */
  exitCode: number;
  /** Captured stdout (if captureStdout was true) */
  stdout: string;
  /** Captured stderr (if captureStderr was true) */
  stderr: string;
}

/**
 * Execute a command and return the result.
 * Uses argument array to prevent shell injection.
 */
export const exec = async (
  command: readonly string[],
  options: ExecOptions = {}
): Promise<Result<ExecResult, DivbanError>> => {
  if (command.length === 0) {
    return Err(new DivbanError(ErrorCode.INVALID_ARGS, "Command array cannot be empty"));
  }

  const [cmd, ...args] = command;
  if (!cmd) {
    return Err(new DivbanError(ErrorCode.INVALID_ARGS, "Command cannot be empty"));
  }

  // Build environment
  const env = {
    ...process.env,
    ...options.env,
  };

  // Handle user switching with sudo
  let finalCommand: string[];
  if (options.user) {
    finalCommand = ["sudo", "-u", options.user, "--", cmd, ...args];
  } else {
    finalCommand = [cmd, ...args];
  }

  const result = await tryCatch(
    async () => {
      const proc = Bun.spawn(finalCommand, {
        env,
        cwd: options.cwd,
        stdout: options.captureStdout !== false ? "pipe" : "inherit",
        stderr: options.captureStderr !== false ? "pipe" : "inherit",
        stdin: options.stdin ? new Response(options.stdin).body : undefined,
      });

      // Handle timeout
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = options.timeout
        ? new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              proc.kill();
              reject(new Error(`Command timed out after ${options.timeout}ms`));
            }, options.timeout);
          })
        : null;

      try {
        const exitPromise = proc.exited;
        const exitCode = timeoutPromise
          ? await Promise.race([exitPromise, timeoutPromise])
          : await exitPromise;

        const stdout = options.captureStdout !== false ? await new Response(proc.stdout).text() : "";
        const stderr = options.captureStderr !== false ? await new Response(proc.stderr).text() : "";

        return { exitCode, stdout, stderr };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
    (e) => wrapError(e, ErrorCode.EXEC_FAILED, `Failed to execute: ${finalCommand.join(" ")}`)
  );

  return result;
};

/**
 * Execute a command and check for success (exit code 0).
 */
export const execSuccess = async (
  command: readonly string[],
  options: ExecOptions = {}
): Promise<Result<ExecResult, DivbanError>> => {
  const result = await exec(command, options);

  if (!result.ok) return result;

  if (result.value.exitCode !== 0) {
    const stderr = result.value.stderr.trim();
    return Err(
      new DivbanError(
        ErrorCode.EXEC_FAILED,
        `Command failed with exit code ${result.value.exitCode}: ${command.join(" ")}${stderr ? `\n${stderr}` : ""}`
      )
    );
  }

  return result;
};

/**
 * Execute a command and return stdout on success.
 */
export const execOutput = async (
  command: readonly string[],
  options: ExecOptions = {}
): Promise<Result<string, DivbanError>> => {
  const result = await execSuccess(command, { ...options, captureStdout: true });

  if (!result.ok) return result;

  return Ok(result.value.stdout);
};

/**
 * Check if a command exists in PATH.
 */
export const commandExists = async (command: string): Promise<boolean> => {
  const result = await exec(["which", command], { captureStdout: true, captureStderr: true });
  return result.ok && result.value.exitCode === 0;
};

/**
 * Run command as a specific user with proper environment.
 */
export const execAsUser = async (
  user: string,
  uid: number,
  command: readonly string[],
  options: Omit<ExecOptions, "user"> = {}
): Promise<Result<ExecResult, DivbanError>> => {
  return exec(command, {
    ...options,
    user,
    env: {
      ...options.env,
      XDG_RUNTIME_DIR: `/run/user/${uid}`,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${uid}/bus`,
    },
  });
};
