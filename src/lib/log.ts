// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Structured logging with ADT-based style dispatch and atomic step counting.
 *
 * Design: LogStyle ADT enables exhaustive pattern matching on log variants,
 * ensuring compile-time safety when new styles are added. Annotations decouple
 * visual formatting (handled in effect-logger.ts) from log call sites.
 */

import { Data, Effect, Match, SynchronizedRef, pipe } from "effect";

// ============================================================================
// LogStyle ADT
// ============================================================================

/**
 * Closed union of log styles. Match.exhaustive enforces handling all variants,
 * so adding a new style produces compile errors at all unhandled call sites.
 */
type LogStyle = Data.TaggedEnum<{
  step: { readonly current: number; readonly total: number };
  success: object;
  fail: object;
}>;

const { step, success, fail } = Data.taggedEnum<LogStyle>();

/** Encode to annotation records that effect-logger.ts interprets for formatting. */
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

/** All styled logging routes through here to ensure consistent annotation handling. */
const logStyled = (style: LogStyle, message: string): Effect.Effect<void> =>
  Effect.log(message).pipe(Effect.annotateLogs(encodeStyle(style)));

// ============================================================================
// Public Logging Functions
// ============================================================================

export const logStep = (current: number, total: number, message: string): Effect.Effect<void> =>
  logStyled(step({ current, total }), message);

export const logSuccess = (message: string): Effect.Effect<void> => logStyled(success(), message);

export const logFail = (message: string): Effect.Effect<void> => logStyled(fail(), message);

/** Bypasses Effect logger for raw program output (command results, status info). */
export const writeOutput = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stdout.write(`${text}\n`);
  });

// ============================================================================
// StepCounter (SynchronizedRef-based)
// ============================================================================

/**
 * SynchronizedRef-based counter for multi-step workflows.
 * Atomicity ensures concurrent step calls produce correct sequence numbers.
 */
export interface StepCounter {
  /** Increment and log atomically; concurrent calls are serialized. */
  readonly next: (message: string) => Effect.Effect<void>;
  readonly current: Effect.Effect<number>;
}

/** Returns effectfully to allow SynchronizedRef allocation within Effect context. */
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
