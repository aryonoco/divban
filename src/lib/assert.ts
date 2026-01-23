// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Assertion utilities for runtime type checking and exhaustive pattern matching.
 */

import { Effect, Option } from "effect";
import { ErrorCode, GeneralError, type GeneralErrorCode } from "./errors";

/** Use when assertion failure should be a recoverable error, not a crash. */
export const assertEffect = (
  condition: boolean,
  message: string,
  code: GeneralErrorCode = ErrorCode.GENERAL_ERROR as 1
): Effect.Effect<void, GeneralError> =>
  condition ? Effect.void : Effect.fail(new GeneralError({ code, message }));

export const hasKeys = <K extends string>(
  value: unknown,
  keys: K[]
): value is Record<K, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return keys.every((key) => key in value);
};

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === "string" && allowed.includes(value as T);

export type NonEmptyArray<T> = readonly [T, ...T[]];

export const isNonEmptyArray = <T>(arr: readonly T[]): arr is NonEmptyArray<T> => arr.length > 0;

/** Total function: never throws, always returns an Effect. */
export const assertNonEmptyEffect = <T>(
  arr: readonly T[],
  message: string
): Effect.Effect<NonEmptyArray<T>, GeneralError> =>
  isNonEmptyArray(arr)
    ? Effect.succeed(arr)
    : Effect.fail(new GeneralError({ code: ErrorCode.GENERAL_ERROR as 1, message }));

export const toNonEmpty = <T>(arr: readonly T[]): Option.Option<NonEmptyArray<T>> =>
  isNonEmptyArray(arr) ? Option.some(arr) : Option.none();

/**
 * Type guard: value is a plain object (not array, not null).
 * Used for recursive object operations like deep merge.
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
