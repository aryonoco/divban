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

import { Cause, Effect, Exit, pipe } from "effect";
import { program } from "./cli/index";

/**
 * Extract exit code from Effect Exit.
 * Handles both success and failure cases with proper error extraction.
 */
const exitCodeFromExit = (exit: Exit.Exit<number, unknown>): number =>
  Exit.match(exit, {
    onSuccess: (code): number => code,
    onFailure: (cause): number =>
      pipe(Cause.failureOption(cause), (opt) =>
        opt._tag === "Some" &&
        typeof opt.value === "object" &&
        opt.value !== null &&
        "code" in opt.value
          ? (opt.value as { code: number }).code
          : 1
      ),
  });

/**
 * Log error from Exit cause.
 */
const logExitError = (exit: Exit.Exit<number, unknown>): void => {
  if (Exit.isFailure(exit)) {
    const failOpt = Cause.failureOption(exit.cause);
    if (failOpt._tag === "Some") {
      const err = failOpt.value;
      if (typeof err === "object" && err !== null && "message" in err) {
        console.error(`Error: ${(err as { message: string }).message}`);
      }
    } else {
      // Defect or interruption
      console.error("Unexpected error:", Cause.pretty(exit.cause));
    }
  }
};

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
