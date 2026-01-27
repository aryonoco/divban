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
 * Uses BunRuntime.runMain for automatic signal handling and fiber interruption.
 */

import { BunContext, BunRuntime } from "@effect/platform-bun";
import type { Teardown } from "@effect/platform/Runtime";
import { Cause, Effect, Exit, Match, Option, pipe } from "effect";
import { cli } from "./cli/index";

const divbanTeardown: Teardown = (exit, onExit): void =>
  onExit(
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
    })
  );

if (import.meta.main) {
  BunRuntime.runMain(cli(process.argv).pipe(Effect.provide(BunContext.layer)), {
    disableErrorReporting: true,
    disablePrettyLogger: true,
    teardown: divbanTeardown,
  });
}
