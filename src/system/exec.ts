// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Command execution wrapper using Effect for error handling.
 * Uses Bun.spawn for process management and Bun Shell for complex piping.
 */

import { $ } from "bun";
import { Effect, Option, ParseResult, Schema, pipe } from "effect";
import { ConfigError, ErrorCode, GeneralError, SystemError, errorMessage } from "../lib/errors";
import type { UserId, Username } from "../lib/types";

export interface ExecOptions {
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
  user?: string;
  captureStdout?: boolean;
  captureStderr?: boolean;
  stdin?: string;
  signal?: AbortSignal;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Helper to create a SystemError for exec failures.
 */
const execError = (command: string, e: unknown): SystemError =>
  new SystemError({
    code: ErrorCode.EXEC_FAILED as 26,
    message: `Failed to execute: ${command}: ${errorMessage(e)}`,
    ...(e instanceof Error ? { cause: e } : {}),
  });

/**
 * Execute a command and return the result.
 */
export const exec = (
  command: readonly string[],
  options: ExecOptions = {}
): Effect.Effect<ExecResult, SystemError | GeneralError> =>
  Effect.gen(function* () {
    if (command.length === 0) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "Command array cannot be empty",
        })
      );
    }

    const [cmd, ...args] = command;
    if (!cmd) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "Command cannot be empty",
        })
      );
    }

    const env = {
      ...Bun.env,
      ...options.env,
    };

    const finalCommand: readonly string[] = options.user
      ? [
          "sudo",
          "--preserve-env=XDG_RUNTIME_DIR,DBUS_SESSION_BUS_ADDRESS",
          "-u",
          options.user,
          "--",
          cmd,
          ...args,
        ]
      : [cmd, ...args];

    return yield* Effect.tryPromise({
      try: async (): Promise<ExecResult> => {
        const spawnOptions: Parameters<typeof Bun.spawn>[1] = {
          env,
          stdout: options.captureStdout !== false ? "pipe" : "inherit",
          stderr: options.captureStderr !== false ? "pipe" : "inherit",
          stdin: options.stdin ? new Response(options.stdin).body : undefined,
        };

        if (options.cwd) {
          spawnOptions.cwd = options.cwd;
        }
        if (options.timeout) {
          spawnOptions.timeout = options.timeout;
        }
        if (options.signal) {
          spawnOptions.signal = options.signal;
        }

        const proc = Bun.spawn([...finalCommand], spawnOptions);
        const exitCode = await proc.exited;

        const stdout =
          options.captureStdout !== false && proc.stdout
            ? await Bun.readableStreamToText(proc.stdout as ReadableStream)
            : "";
        const stderr =
          options.captureStderr !== false && proc.stderr
            ? await Bun.readableStreamToText(proc.stderr as ReadableStream)
            : "";

        return { exitCode, stdout, stderr };
      },
      catch: (e): SystemError => execError(finalCommand.join(" "), e),
    });
  });

/**
 * Execute a command and check for success (exit code 0).
 */
export const execSuccess = (
  command: readonly string[],
  options: ExecOptions = {}
): Effect.Effect<ExecResult, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const result = yield* exec(command, options);

    if (result.exitCode !== 0) {
      const stderr = result.stderr.trim();
      return yield* Effect.fail(
        new SystemError({
          code: ErrorCode.EXEC_FAILED as 26,
          message: `Command failed with exit code ${result.exitCode}: ${command.join(" ")}${stderr ? `\n${stderr}` : ""}`,
        })
      );
    }

    return result;
  });

/**
 * Execute a command and return stdout on success.
 */
export const execOutput = (
  command: readonly string[],
  options: ExecOptions = {}
): Effect.Effect<string, SystemError | GeneralError> =>
  Effect.map(execSuccess(command, { ...options, captureStdout: true }), (r) => r.stdout);

/**
 * Check if a command exists in PATH.
 */
export const commandExists = (command: string): boolean => Bun.which(command) !== null;

/**
 * Run command as a specific user with proper environment.
 */
export const execAsUser = (
  user: Username,
  uid: UserId,
  command: readonly string[],
  options: Omit<ExecOptions, "user"> = {}
): Effect.Effect<ExecResult, SystemError | GeneralError> =>
  exec(command, {
    ...options,
    user,
    cwd: options.cwd ?? "/tmp",
    env: {
      ...options.env,
      XDG_RUNTIME_DIR: `/run/user/${uid}`,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${uid}/bus`,
    },
  });

export interface ShellOptions {
  cwd?: string;
  env?: Record<string, string>;
  uid?: UserId;
}

const buildShellEnv = (options: ShellOptions): Record<string, string | undefined> => ({
  ...Bun.env,
  ...options.env,
  ...(options.uid
    ? {
        XDG_RUNTIME_DIR: `/run/user/${options.uid}`,
        DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${options.uid}/bus`,
      }
    : {}),
});

/**
 * Execute a shell command with piping support using Bun Shell.
 */
export const shell = (
  command: string,
  options: ShellOptions = {}
): Effect.Effect<ExecResult, SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<ExecResult> => {
      let cmd = $`${{ raw: command }}`.nothrow().quiet();

      if (options.cwd) {
        cmd = cmd.cwd(options.cwd);
      }

      cmd = cmd.env(buildShellEnv(options));

      const result = await cmd;
      return {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };
    },
    catch: (e): SystemError => execError(command, e),
  });

/**
 * Execute a shell command and return stdout as text.
 */
export const shellText = (
  command: string,
  options: ShellOptions = {}
): Effect.Effect<string, SystemError> =>
  Effect.tryPromise({
    try: (): Promise<string> => {
      let cmd = $`${{ raw: command }}`.quiet();

      if (options.cwd) {
        cmd = cmd.cwd(options.cwd);
      }

      cmd = cmd.env(buildShellEnv(options));

      return cmd.text();
    },
    catch: (e): SystemError => execError(command, e),
  });

/**
 * Execute a shell command and return stdout as lines.
 */
export const shellLines = (
  command: string,
  options: ShellOptions = {}
): Effect.Effect<readonly string[], SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<readonly string[]> => {
      let cmd = $`${{ raw: command }}`.quiet();

      if (options.cwd) {
        cmd = cmd.cwd(options.cwd);
      }

      cmd = cmd.env(buildShellEnv(options));

      return await Array.fromAsync(cmd.lines());
    },
    catch: (e): SystemError => execError(command, e),
  });

/**
 * Escape a string for safe use in shell commands.
 */
export const shellEscape = (input: string): string => $.escape(input);

/**
 * Expand brace expressions in a string.
 */
export const shellBraces = (pattern: string): string[] => $.braces(pattern);

/**
 * Execute shell command as another user via sudo.
 */
export const shellAsUser = (
  user: Username,
  uid: UserId,
  command: string,
  options: Omit<ShellOptions, "uid"> = {}
): Effect.Effect<ExecResult, SystemError> => {
  const escapedCommand = $.escape(command);
  return shell(
    `sudo --preserve-env=XDG_RUNTIME_DIR,DBUS_SESSION_BUS_ADDRESS -u ${user} -- sh -c ${escapedCommand}`,
    {
      uid,
      cwd: options.cwd ?? "/tmp",
      ...options,
    }
  );
};

/**
 * Build shell command with options applied via Option.match (no conditionals).
 */
const buildShellCommand = (command: string, options: ShellOptions): ReturnType<typeof $> =>
  pipe(
    $`${{ raw: command }}`.quiet(),
    (cmd) =>
      pipe(
        Option.fromNullable(options.cwd),
        Option.match({
          onNone: (): ReturnType<typeof $> => cmd,
          onSome: (cwd): ReturnType<typeof $> => cmd.cwd(cwd),
        })
      ),
    (cmd) => cmd.env(buildShellEnv(options))
  );

/**
 * Execute shell command and parse stdout as validated JSON.
 *
 * The `unknown` type appears only at the parse boundary - the raw JSON
 * from the external command. Schema validation immediately converts to
 * the concrete type A.
 *
 * @param command - Shell command to execute
 * @param schema - Effect Schema for validation (A = output type, I = encoded type)
 * @param options - Shell execution options
 * @returns Effect producing validated A or SystemError/ConfigError
 */
export const shellJson = <A, I>(
  command: string,
  schema: Schema.Schema<A, I, never>,
  options: ShellOptions = {}
): Effect.Effect<A, SystemError | ConfigError> =>
  pipe(
    // Step 1: Execute command, get raw JSON (unknown at boundary)
    Effect.tryPromise({
      try: (): Promise<unknown> => buildShellCommand(command, options).json(),
      catch: (e): SystemError => execError(command, e),
    }),
    // Step 2: Validate unknown → A via schema
    Effect.flatMap((json: unknown) =>
      pipe(
        Schema.decodeUnknown(schema)(json),
        Effect.mapError(
          (e): ConfigError =>
            new ConfigError({
              code: ErrorCode.CONFIG_VALIDATION_ERROR as 12,
              message: `JSON validation failed: ${ParseResult.TreeFormatter.formatErrorSync(e)}`,
            })
        )
      )
    )
  );

/**
 * Execute a shell command and return stdout as a Blob.
 */
export const shellBlob = (
  command: string,
  options: ShellOptions = {}
): Effect.Effect<Blob, SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<Blob> => {
      let cmd = $`${{ raw: command }}`.quiet();

      if (options.cwd) {
        cmd = cmd.cwd(options.cwd);
      }

      cmd = cmd.env(buildShellEnv(options));

      return await cmd.blob();
    },
    catch: (e): SystemError => execError(command, e),
  });
