// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Composable operation logging using Effect.tapBoth for entry/exit patterns.
 * Includes automatic duration tracking via Effect.withLogSpan.
 */

import { Effect, Match, pipe } from "effect";
import { logFail, logSuccess } from "./log";

type OperationVerb = "Starting" | "Stopping" | "Restarting";

/** Verb conjugation for operation logging: "Starting" -> "started" (success) / "start" (infinitive for errors). */
const verbToPastTense = (verb: OperationVerb): string =>
  pipe(
    Match.value(verb),
    Match.when("Starting", () => "started"),
    Match.when("Stopping", () => "stopped"),
    Match.when("Restarting", () => "restarted"),
    Match.exhaustive
  );

const verbToInfinitive = (verb: OperationVerb): string =>
  pipe(
    Match.value(verb),
    Match.when("Starting", () => "start"),
    Match.when("Stopping", () => "stop"),
    Match.when("Restarting", () => "restart"),
    Match.exhaustive
  );

/** Normalizes display name to span naming conventions (lowercase, hyphenated). */
const toSpanName = (displayName: string, verb: OperationVerb): string => {
  const sanitized = displayName.toLowerCase().replace(/\s+/g, "-");
  return `${verb.toLowerCase()}-${sanitized}`;
};

/**
 * Wrap an operation with entry/exit logging using Effect.tapBoth.
 * Includes automatic duration tracking via Effect.withLogSpan.
 */
export const withOperationLogging = <A, E, R>(
  displayName: string,
  verb: OperationVerb,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  pipe(
    Effect.logInfo(`${verb} ${displayName}...`),
    Effect.andThen(effect),
    Effect.tapBoth({
      onSuccess: (): Effect.Effect<void> =>
        logSuccess(`${displayName} ${verbToPastTense(verb)} successfully`),
      onFailure: (): Effect.Effect<void> =>
        logFail(`${displayName} failed to ${verbToInfinitive(verb)}`),
    }),
    Effect.withLogSpan(toSpanName(displayName, verb))
  );

export type { OperationVerb };
