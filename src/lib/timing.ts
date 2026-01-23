// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Stopwatch using Effect Ref for concurrency-safe lap timing. */

import { Duration, Effect, Ref, pipe } from "effect";

export interface EffectStopwatch {
  readonly elapsed: Effect.Effect<Duration.Duration>;
  readonly lap: Effect.Effect<Duration.Duration>;
  readonly reset: Effect.Effect<void>;
}

export const createStopwatchEffect = (): Effect.Effect<EffectStopwatch> =>
  Effect.gen(function* () {
    const startNs = Bun.nanoseconds();
    const lastLapRef = yield* Ref.make(startNs);

    return {
      elapsed: Effect.sync(() => Duration.nanos(BigInt(Bun.nanoseconds() - startNs))),
      lap: pipe(
        Ref.getAndUpdate(lastLapRef, () => Bun.nanoseconds()),
        Effect.map((last) => Duration.nanos(BigInt(Bun.nanoseconds() - last)))
      ),
      reset: Ref.set(lastLapRef, Bun.nanoseconds()),
    };
  });
