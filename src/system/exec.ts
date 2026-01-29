// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Command execution with two strategies:
 * - exec*: Structured argument arrays via @effect/platform Command API
 * - shell*: Template strings via Bun Shell for piping/redirection
 *
 * XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS preservation is critical for
 * systemd integration: user services need these to communicate with the
 * session bus and access runtime directories in rootless Podman setups.
 */

import { Command } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { $ } from "bun";
import { Effect, Option, ParseResult, Schema, Stream, pipe } from "effect";
import { ConfigError, ErrorCode, GeneralError, SystemError, errorMessage } from "../lib/errors";
import type { UserId, Username } from "../lib/types";

export interface ExecOptions {
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
  user?: Username;
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

/** Internalizes BunContext.layer so callers don't need R type parameter. */
const withExecutor = <A, E>(
  effect: Effect.Effect<A, E, BunContext.BunContext>
): Effect.Effect<A, E> => effect.pipe(Effect.provide(BunContext.layer));

const execError = (command: string, e: unknown): SystemError =>
  new SystemError({
    code: ErrorCode.EXEC_FAILED,
    message: `Failed to execute: ${command}: ${errorMessage(e)}`,
    ...(e instanceof Error ? { cause: e } : {}),
  });

/** Non-empty guarantee prevents index errors on destructuring. */
interface ValidatedCommand {
  readonly cmd: string;
  readonly args: readonly string[];
}

const validateCommand = (
  command: readonly string[]
): Effect.Effect<ValidatedCommand, GeneralError> =>
  pipe(
    Effect.succeed(command),
    Effect.filterOrFail(
      (c): c is readonly [string, ...string[]] => c.length > 0 && c[0] !== undefined && c[0] !== "",
      () =>
        new GeneralError({
          code: ErrorCode.INVALID_ARGS,
          message: "Command array cannot be empty",
        })
    ),
    Effect.map(([cmd, ...args]): ValidatedCommand => ({ cmd, args }))
  );

const streamToString = <E>(stream: Stream.Stream<Uint8Array, E>): Effect.Effect<string, E> =>
  pipe(
    stream,
    Stream.decodeText("utf-8"),
    Stream.runFold("", (acc, s) => acc + s)
  );

export const exec = (
  command: readonly string[],
  options: ExecOptions = {}
): Effect.Effect<ExecResult, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { cmd, args } = yield* validateCommand(command);

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

    const commandStr = finalCommand.join(" ");

    return yield* withExecutor(
      Effect.gen(function* () {
        // finalCommand is guaranteed non-empty by validateCommand
        const firstCmd = finalCommand[0] ?? "";
        const restArgs = finalCommand.slice(1);
        const baseCommand = Command.make(firstCmd, ...restArgs);

        const configuredCommand = pipe(
          baseCommand,
          (c) => Command.env(c, env),
          (c) => (options.cwd !== undefined ? Command.workingDirectory(c, options.cwd) : c),
          (c) => (options.stdin !== undefined ? Command.feed(c, options.stdin) : c)
        );

        const process = yield* Command.start(configuredCommand);

        // Parallel capture: exitCode + both streams ready independently
        const [exitCode, stdout, stderr] = yield* Effect.all(
          [
            process.exitCode,
            options.captureStdout !== false ? streamToString(process.stdout) : Effect.succeed(""),
            options.captureStderr !== false ? streamToString(process.stderr) : Effect.succeed(""),
          ],
          { concurrency: 3 }
        );

        return { exitCode, stdout, stderr };
      }).pipe(Effect.scoped)
    ).pipe(Effect.mapError((e) => execError(commandStr, e)));
  });

/** Fails if exit code is non-zero. Use exec() when exit code matters but isn't fatal. */
export const execSuccess = (
  command: readonly string[],
  options: ExecOptions = {}
): Effect.Effect<ExecResult, SystemError | GeneralError> =>
  pipe(
    exec(command, options),
    Effect.filterOrFail(
      (result): result is ExecResult => result.exitCode === 0,
      (result) => {
        const stderr = result.stderr.trim();
        return new SystemError({
          code: ErrorCode.EXEC_FAILED,
          message: `Command failed with exit code ${result.exitCode}: ${command.join(" ")}${stderr ? `\n${stderr}` : ""}`,
        });
      }
    )
  );

export const execOutput = (
  command: readonly string[],
  options: ExecOptions = {}
): Effect.Effect<string, SystemError | GeneralError> =>
  Effect.map(execSuccess(command, { ...options, captureStdout: true }), (r) => r.stdout);

export const execLines = (
  command: readonly string[],
  options: ExecOptions = {}
): Effect.Effect<readonly string[], SystemError | GeneralError> =>
  Effect.map(execOutput(command, options), (stdout) =>
    stdout
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)
  );

export const commandExists = (command: string): boolean => Bun.which(command) !== null;

/**
 * Execute as service user with systemd session environment.
 * Sets XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS for the target UID,
 * enabling systemctl --user and socket activation in rootless containers.
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

// ============================================================================
// Shell Operations (Bun Shell)
// ============================================================================
// Kept for piping/redirection: "cat file | grep pattern" syntax.
// exec* functions don't support shell features; use shell* when needed.

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

/** nothrow: capture exit code instead of throwing on non-zero. */
const buildShellCommandNothrow = (command: string, options: ShellOptions): ReturnType<typeof $> =>
  pipe(
    $`${{ raw: command }}`.nothrow().quiet(),
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

export const shell = (
  command: string,
  options: ShellOptions = {}
): Effect.Effect<ExecResult, SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<ExecResult> => {
      const result = await buildShellCommandNothrow(command, options);
      return {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };
    },
    catch: (e): SystemError => execError(command, e),
  });

export const shellText = (
  command: string,
  options: ShellOptions = {}
): Effect.Effect<string, SystemError> =>
  Effect.tryPromise({
    try: (): Promise<string> => buildShellCommand(command, options).text(),
    catch: (e): SystemError => execError(command, e),
  });

export const shellLines = (
  command: string,
  options: ShellOptions = {}
): Effect.Effect<readonly string[], SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<readonly string[]> =>
      await Array.fromAsync(buildShellCommand(command, options).lines()),
    catch: (e): SystemError => execError(command, e),
  });

export const shellEscape = (input: string): string => $.escape(input);

export const shellBraces = (pattern: string): string[] => $.braces(pattern);

/** Shell equivalent of execAsUser. Wraps command in sudo with session environment. */
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
 * Parse command output as JSON with Schema validation.
 * The unknown type at json() boundary is immediately validated to A.
 * Failures: SystemError (exec), ConfigError (parse/validation).
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
              code: ErrorCode.CONFIG_VALIDATION_ERROR,
              message: `JSON validation failed: ${ParseResult.TreeFormatter.formatErrorSync(e)}`,
            })
        )
      )
    )
  );

export const shellBlob = (
  command: string,
  options: ShellOptions = {}
): Effect.Effect<Blob, SystemError> =>
  Effect.tryPromise({
    try: async (): Promise<Blob> => await buildShellCommand(command, options).blob(),
    catch: (e): SystemError => execError(command, e),
  });
