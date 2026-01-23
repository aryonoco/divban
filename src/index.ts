#!/usr/bin/env bun
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Divban - Unified Rootless Podman Service Manager
 *
 * Main entry point for the CLI application.
 * This is the "imperative shell" - the only place where Effect runtime is executed.
 */

import { Cause, Effect, Exit, Match, Option, pipe } from "effect";
import { program } from "./cli/index";

const exitCodeFromExit = (exit: Exit.Exit<number, unknown>): number =>
  Exit.match(exit, {
    onSuccess: (code): number => code,
    onFailure: (cause): number =>
      Option.match(Cause.failureOption(cause), {
        onNone: (): number => 1,
        onSome: (value: unknown): number =>
          pipe(
            Match.value(value),
            Match.when(
              (v: unknown): v is { code: number } =>
                typeof v === "object" && v !== null && "code" in v,
              (v: { code: number }) => v.code
            ),
            Match.orElse(() => 1)
          ),
      }),
  });

const logExitError = (exit: Exit.Exit<number, unknown>): void =>
  Exit.match(exit, {
    onSuccess: (): void => undefined,
    onFailure: (cause): void =>
      Option.match(Cause.failureOption(cause), {
        onNone: (): void => console.error("Unexpected error:", Cause.pretty(cause)),
        onSome: (err: unknown): void =>
          pipe(
            Match.value(err),
            Match.when(
              (v: unknown): v is { message: string } =>
                typeof v === "object" && v !== null && "message" in v,
              (v: { message: string }) => console.error(`Error: ${v.message}`)
            ),
            Match.orElse(() => undefined)
          ),
      }),
  });

/**
 * Main entry point - wrapped in async function for bytecode compatibility.
 * Bytecode compilation requires CommonJS format which doesn't support top-level await.
 */
async function main(): Promise<never> {
  const exit = await Effect.runPromiseExit(program(Bun.argv.slice(2)));
  logExitError(exit);
  process.exit(exitCodeFromExit(exit));
}

// Only run if this is the main entry point
// Uses Bun.main for optimal entry point detection
if (import.meta.main) {
  main();
}
