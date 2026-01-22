// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Helper functions for Effect Option that aren't provided by Effect
 * or have different signatures than our previous custom implementation.
 */

import { Effect, Option, pipe } from "effect";

/**
 * Total: Option → Effect conversion with custom error.
 */
export const expectOptionEffect = <T, E>(
  opt: Option.Option<T>,
  onNone: () => E
): Effect.Effect<T, E> => (Option.isSome(opt) ? Effect.succeed(opt.value) : Effect.fail(onNone()));

/**
 * Filter to non-empty arrays.
 * Returns Some(array) if array exists and has elements, None otherwise.
 */
export const nonEmpty = <T>(arr: readonly T[] | undefined | null): Option.Option<readonly T[]> =>
  pipe(
    Option.fromNullable(arr),
    Option.filter((a) => a.length > 0)
  );

/**
 * Map and provide default value.
 */
export const mapOr = <T, U>(opt: Option.Option<T>, defaultValue: U, fn: (value: T) => U): U =>
  pipe(
    opt,
    Option.map(fn),
    Option.getOrElse(() => defaultValue)
  );

/**
 * Map and provide lazy default.
 */
export const mapOrElse = <T, U>(
  opt: Option.Option<T>,
  defaultFn: () => U,
  fn: (value: T) => U
): U => pipe(opt, Option.map(fn), Option.getOrElse(defaultFn));

/**
 * XOR combinator using nested Option.match (ML-style pattern matching).
 * Returns Some if exactly one is Some, None otherwise.
 */
export const xorOption = <T>(a: Option.Option<T>, b: Option.Option<T>): Option.Option<T> =>
  Option.match(a, {
    onNone: (): Option.Option<T> => b,
    onSome: (): Option.Option<T> =>
      Option.match(b, {
        onNone: (): Option.Option<T> => a,
        onSome: (): Option.Option<T> => Option.none(),
      }),
  });

// ─────────────────────────────────────────────────────────────────────────────
// Object Construction Helpers (for exactOptionalPropertyTypes compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Conditionally spread an optional property.
 * Compatible with exactOptionalPropertyTypes: true.
 *
 * Usage: { required, ...optionalProp("foo", maybeFoo) }
 * Result: { required } if maybeFoo is undefined
 *         { required, foo: value } if maybeFoo is defined
 */
export const optionalProp = <K extends string, V>(
  key: K,
  value: V | undefined
): { [P in K]?: V } =>
  value !== undefined ? ({ [key]: value } as { [P in K]?: V }) : ({} as { [P in K]?: V });

/**
 * Build an object from tuples, omitting undefined values.
 * Compatible with exactOptionalPropertyTypes.
 *
 * Usage: buildObject([["foo", maybeFoo], ["bar", maybeBar]])
 */
export const buildObject = <T extends Record<string, unknown>>(
  entries: readonly (readonly [keyof T, T[keyof T] | undefined])[]
): Partial<T> =>
  pipe(
    entries,
    (arr) => arr.filter((entry): entry is [keyof T, T[keyof T]] => entry[1] !== undefined),
    (filtered) => Object.fromEntries(filtered) as Partial<T>
  );
