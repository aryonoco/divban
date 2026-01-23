// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Convenience wrappers for common Option patterns in Effect.
 * Effect's Option API is comprehensive but verbose for frequent operations;
 * these shortcuts reduce boilerplate without losing type safety.
 */

import { Effect, Option, pipe } from "effect";

/**
 * Convert Option to Effect, failing if None.
 */
export const expectOptionEffect = <T, E>(
  opt: Option.Option<T>,
  onNone: () => E
): Effect.Effect<T, E> =>
  Option.match(opt, {
    onNone: (): Effect.Effect<T, E> => Effect.fail(onNone()),
    onSome: (value): Effect.Effect<T, E> => Effect.succeed(value),
  });

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
 * Return the option that has a value, or None if both/neither have values.
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
// Object Construction Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Conditionally spread an optional property.
 */
export const optionalProp = <K extends string, V>(
  key: K,
  value: V | undefined
): { [P in K]?: V } =>
  value !== undefined ? ({ [key]: value } as { [P in K]?: V }) : ({} as { [P in K]?: V });

/**
 * Build an object from tuples, omitting undefined values.
 */
export const buildObject = <T extends Record<string, unknown>>(
  entries: readonly (readonly [keyof T, T[keyof T] | undefined])[]
): Partial<T> =>
  pipe(
    entries,
    (arr) => arr.filter((entry): entry is [keyof T, T[keyof T]] => entry[1] !== undefined),
    (filtered) => Object.fromEntries(filtered) as Partial<T>
  );

// ============================================================================
// Option Extraction (avoiding type assertions)
// ============================================================================

/**
 * Handle Option with separate functions for Some and None cases.
 * Prefer over getOrElse when the default computation is non-trivial.
 */
export const fold =
  <A, B>(onNone: () => B, onSome: (a: A) => B) =>
  (opt: Option.Option<A>): B =>
    Option.match(opt, { onNone, onSome });

/**
 * Check if Option contains a value satisfying predicate.
 */
export const exists =
  <A>(predicate: (a: A) => boolean) =>
  (opt: Option.Option<A>): boolean =>
    Option.match(opt, {
      onNone: (): boolean => false,
      onSome: predicate,
    });

/**
 * Lift a partial function to work with Option.
 * Useful for safe property access.
 */
export const fromPartial =
  <A, B>(f: (a: A) => B | undefined | null) =>
  (a: A): Option.Option<B> =>
    Option.fromNullable(f(a));

/**
 * Sequence: Option<A>[] -> Option<A[]>
 * Returns Some only if ALL elements are Some.
 */
export const sequence = <A>(opts: readonly Option.Option<A>[]): Option.Option<readonly A[]> =>
  Option.all(opts);

/**
 * Apply function to each element, returning None if any call fails.
 */
export const traverse =
  <A, B>(f: (a: A) => Option.Option<B>) =>
  (arr: readonly A[]): Option.Option<readonly B[]> =>
    sequence(arr.map(f));

/**
 * Filter out None values and extract Some values.
 */
export const catOptions = <A>(opts: readonly Option.Option<A>[]): readonly A[] =>
  opts.flatMap((opt) =>
    Option.match(opt, {
      onNone: (): readonly A[] => [],
      onSome: (a): readonly A[] => [a],
    })
  );
