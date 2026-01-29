// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Test helpers for providing Effect platform layers in tests.
 * BunContext.layer provides FileSystem.FileSystem, CommandExecutor.CommandExecutor,
 * Path, and Terminal services from @effect/platform-bun.
 */

import { BunContext } from "@effect/platform-bun";
import { Effect, type Exit, type Layer } from "effect";

/**
 * Test layer providing all platform services.
 * Use with runTest/runTestExit for effects requiring FileSystem or CommandExecutor.
 */
export const TestLayer: Layer.Layer<BunContext.BunContext> = BunContext.layer;

/**
 * Run an effect in tests with platform services provided.
 */
export const runTest = <A, E>(effect: Effect.Effect<A, E, BunContext.BunContext>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

/**
 * Run an effect in tests and return the Exit value.
 */
export const runTestExit = <A, E>(
  effect: Effect.Effect<A, E, BunContext.BunContext>
): Promise<Exit.Exit<A, E>> => Effect.runPromiseExit(effect.pipe(Effect.provide(TestLayer)));
