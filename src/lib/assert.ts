// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Assertion utilities for runtime type checking and exhaustive pattern matching.
 *
 * Preferred patterns for nullable value handling:
 *
 * 1. Option-based (preferred):
 *    const opt = fromNullable(maybeNull);
 *    const value = expect(opt, "should not be null");
 *
 * 2. Effect-based (for error contexts):
 *    const value = yield* Effect.fromNullable(maybeNull).pipe(
 *      Effect.mapError(() => new ConfigError({ ... }))
 *    );
 *
 * 3. With default:
 *    const value = getOrElse(fromNullable(maybeNull), defaultValue);
 */

import { ErrorCode, GeneralError, type GeneralErrorCode } from "./errors";

/**
 * Assert that a condition is true at runtime.
 * Throws GeneralError if the assertion fails.
 */
export const assert = (
  condition: boolean,
  message: string,
  code: GeneralErrorCode = ErrorCode.GENERAL_ERROR as 1
): asserts condition => {
  if (!condition) {
    throw new GeneralError({ code, message });
  }
};

/**
 * Type guard for checking if a value is an object with specific keys.
 */
export const hasKeys = <K extends string>(
  value: unknown,
  keys: K[]
): value is Record<K, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return keys.every((key) => key in value);
};

/**
 * Type guard for checking if a value is a non-empty string.
 */
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * Type guard for checking if a value is a positive integer.
 */
export const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/**
 * Type guard for checking if a value is a non-negative integer.
 */
export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Check if a value is one of the allowed values.
 */
export const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === "string" && allowed.includes(value as T);

/**
 * Narrow an array type to non-empty.
 */
export type NonEmptyArray<T> = [T, ...T[]];

export const isNonEmptyArray = <T>(arr: T[]): arr is NonEmptyArray<T> => arr.length > 0;

/**
 * Assert array is non-empty and return typed result.
 */
export const assertNonEmpty = <T>(arr: T[], message: string): NonEmptyArray<T> => {
  if (!isNonEmptyArray(arr)) {
    throw new GeneralError({ code: ErrorCode.GENERAL_ERROR as 1, message });
  }
  return arr;
};

/**
 * Type guard: value is a plain object (not array, not null).
 * Used for recursive object operations like deep merge.
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
