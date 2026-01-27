// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Thin Effect wrappers for structured logging patterns.
 * Uses annotations (logStyle, stepNumber, stepTotal) that the custom
 * Logger in effect-logger.ts reads from the HashMap.
 */

import { Effect } from "effect";

/** Log a progress step (e.g. "[1/5] → Installing files"). */
export const logStep = (current: number, total: number, message: string): Effect.Effect<void> =>
  Effect.log(message).pipe(
    Effect.annotateLogs({
      logStyle: "step",
      stepNumber: String(current),
      stepTotal: String(total),
    })
  );

/** Log a success message (e.g. "✓ Setup completed"). */
export const logSuccess = (message: string): Effect.Effect<void> =>
  Effect.log(message).pipe(Effect.annotateLogs("logStyle", "success"));

/** Log a failure message (e.g. "✗ Service not found"). */
export const logFail = (message: string): Effect.Effect<void> =>
  Effect.log(message).pipe(Effect.annotateLogs("logStyle", "fail"));

/** Write raw program output to stdout (bypasses the logger entirely). */
export const writeOutput = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stdout.write(`${text}\n`);
  });
