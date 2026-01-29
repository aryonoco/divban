// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Structured logging with ADT-based style dispatch and atomic step counting.
 * Uses annotations that effect-logger.ts reads from the HashMap.
 */

import { Data, Effect, Match, SynchronizedRef, pipe } from "effect";

// ============================================================================
// LogStyle ADT (using Data.TaggedEnum for linter-safe _tag handling)
// ============================================================================

/** ADT capturing all styled log variants with type-safe encoding. */
type LogStyle = Data.TaggedEnum<{
  step: { readonly current: number; readonly total: number };
  success: object;
  fail: object;
}>;

const { step, success, fail } = Data.taggedEnum<LogStyle>();

/** Encode ADT to annotation record (eliminates magic strings at call sites). */
const encodeStyle = (style: LogStyle): Record<string, string> =>
  pipe(
    Match.value(style),
    Match.tag("step", ({ current, total }) => ({
      logStyle: "step",
      stepNumber: String(current),
      stepTotal: String(total),
    })),
    Match.tag("success", () => ({ logStyle: "success" })),
    Match.tag("fail", () => ({ logStyle: "fail" })),
    Match.exhaustive
  );

/** Single polymorphic logging function dispatching on ADT. */
const logStyled = (style: LogStyle, message: string): Effect.Effect<void> =>
  Effect.log(message).pipe(Effect.annotateLogs(encodeStyle(style)));

// ============================================================================
// Public Logging Functions
// ============================================================================

/** Log a progress step (e.g. "[1/5] -> Installing files"). */
export const logStep = (current: number, total: number, message: string): Effect.Effect<void> =>
  logStyled(step({ current, total }), message);

/** Log a success message (e.g. "check mark Setup completed"). */
export const logSuccess = (message: string): Effect.Effect<void> => logStyled(success(), message);

/** Log a failure message (e.g. "x mark Service not found"). */
export const logFail = (message: string): Effect.Effect<void> => logStyled(fail(), message);

/** Write raw program output to stdout (bypasses the logger entirely). */
export const writeOutput = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stdout.write(`${text}\n`);
  });

// ============================================================================
// StepCounter (SynchronizedRef-based)
// ============================================================================

/** Atomic step counter with effectful logging inside updates. */
export interface StepCounter {
  /** Log the next step and increment counter atomically. */
  readonly next: (message: string) => Effect.Effect<void>;
  /** Get current step number (0 = no steps executed yet). */
  readonly current: Effect.Effect<number>;
}

/** Create a step counter for a workflow with known total steps. */
export const createStepCounter = (total: number): Effect.Effect<StepCounter> =>
  Effect.gen(function* () {
    const ref = yield* SynchronizedRef.make(0);

    return {
      next: (message: string): Effect.Effect<void> =>
        SynchronizedRef.updateAndGetEffect(ref, (n) =>
          Effect.gen(function* () {
            const step = n + 1;
            yield* logStep(step, total, message);
            return step;
          })
        ).pipe(Effect.asVoid),

      current: SynchronizedRef.get(ref),
    };
  });
