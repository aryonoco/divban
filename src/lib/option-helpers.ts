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

import { Option, pipe } from "effect";

/**
 * Like Rust's expect - unwrap with custom error message.
 */
export const expectOption = <T>(opt: Option.Option<T>, message: string): T => {
  if (Option.isSome(opt)) {
    return opt.value;
  }
  throw new Error(message);
};

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
 * XOR combinator - Some if exactly one is Some.
 */
export const xorOption = <T>(a: Option.Option<T>, b: Option.Option<T>): Option.Option<T> => {
  if (Option.isSome(a) && Option.isNone(b)) {
    return a;
  }
  if (Option.isNone(a) && Option.isSome(b)) {
    return b;
  }
  return Option.none();
};

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
