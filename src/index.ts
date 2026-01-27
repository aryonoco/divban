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
 * Main entry point. Runs the @effect/cli command tree with BunContext
 * providing platform services (Terminal, FileSystem, Path).
 * This is the "imperative shell" - the only place where Effect runtime is executed.
 */

import { BunContext } from "@effect/platform-bun";
import { Cause, Effect, Exit, Match, Option, pipe } from "effect";
import { cli } from "./cli/index";

const exitCodeFromExit = (exit: Exit.Exit<void, unknown>): number =>
  Exit.match(exit, {
    onSuccess: (): number => 0,
    onFailure: (cause): number =>
      Option.match(Cause.failureOption(cause), {
        onNone: (): number => 1,
        onSome: (value: unknown): number =>
          pipe(
            Match.value(value),
            Match.when(
              (v: unknown): v is { exitCode: number } =>
                typeof v === "object" && v !== null && "exitCode" in v,
              (v: { exitCode: number }) => v.exitCode
            ),
            Match.when(
              (v: unknown): v is { code: number } =>
                typeof v === "object" && v !== null && "code" in v,
              (v: { code: number }) => Math.min(v.code, 125)
            ),
            Match.orElse(() => 1)
          ),
      }),
  });

/**
 * Main entry point - wrapped in async function for bytecode compatibility.
 * Bytecode compilation requires CommonJS format which doesn't support top-level await.
 */
async function main(): Promise<never> {
  const exit = await Effect.runPromiseExit(
    cli(process.argv).pipe(Effect.provide(BunContext.layer))
  );
  process.exit(exitCodeFromExit(exit));
}

// Only run if this is the main entry point
// Uses Bun.main for optimal entry point detection
if (import.meta.main) {
  main();
}
