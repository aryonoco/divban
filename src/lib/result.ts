// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Result type for functional error handling without exceptions.
 * Inspired by Rust's Result<T, E> type.
 */

import type { DivbanError } from "./errors";

/**
 * Result type - either success with a value or failure with an error.
 * Uses discriminated union for exhaustive pattern matching.
 */
export type Result<T, E = DivbanError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Create a successful result.
 */
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/**
 * Create a failed result.
 */
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/**
 * Map over a successful result, transforming the value.
 * If the result is an error, return it unchanged.
 */
export const mapResult = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  result.ok ? Ok(fn(result.value)) : result;

/**
 * FlatMap (chain) over a successful result.
 * Allows sequencing operations that return Results.
 */
export const flatMapResult = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> => (result.ok ? fn(result.value) : result);

/**
 * Async FlatMap (chain) over a successful result.
 * Allows sequencing operations where the continuation returns a Promise<Result>.
 *
 * @example
 * // Chain sync result to async operation
 * return asyncFlatMapResult(toAbsolute(path), (p) => loadServiceConfig(p, schema));
 *
 * @example
 * // Chain two async operations
 * return asyncFlatMapResult(await stopStack(stack, opts), () => startStack(stack, opts));
 */
export const asyncFlatMapResult = async <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> => (result.ok ? fn(result.value) : result);

/**
 * Collect an array of Results into a Result of array.
 * Returns the first error encountered, or Ok with all values.
 */
export const collectResults = <T, E>(results: readonly Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) {
      return r;
    }
    values.push(r.value);
  }
  return Ok(values);
};

/**
 * Combine two Results of different types into a Result of tuple.
 * Returns the first error encountered, or Ok with both values.
 */
export const combine2 = <A, B, E>(a: Result<A, E>, b: Result<B, E>): Result<[A, B], E> => {
  if (!a.ok) {
    return a;
  }
  if (!b.ok) {
    return b;
  }
  return Ok([a.value, b.value]);
};

/**
 * Combine three Results of different types into a Result of tuple.
 * Returns the first error encountered, or Ok with all values.
 */
export const combine3 = <A, B, C, E>(
  a: Result<A, E>,
  b: Result<B, E>,
  c: Result<C, E>
): Result<[A, B, C], E> => {
  if (!a.ok) {
    return a;
  }
  if (!b.ok) {
    return b;
  }
  if (!c.ok) {
    return c;
  }
  return Ok([a.value, b.value, c.value]);
};

/**
 * Map over the error of a failed result.
 */
export const mapErr = <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
  result.ok ? result : Err(fn(result.error));

/**
 * Unwrap a result, returning the value or throwing the error.
 * Use sparingly - prefer pattern matching with if (result.ok).
 */
export const unwrap = <T, E extends Error>(result: Result<T, E>): T => {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
};

/**
 * Unwrap a result with a default value for errors.
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: NoInfer<T>): T =>
  result.ok ? result.value : defaultValue;

/**
 * Convert a Promise that might throw into a Promise<Result>.
 */
export const tryCatch = async <T>(
  fn: () => Promise<T>,
  mapError: (e: unknown) => DivbanError
): Promise<Result<T, DivbanError>> => {
  try {
    const value = await fn();
    return Ok(value);
  } catch (e) {
    return Err(mapError(e));
  }
};

/**
 * Convert a sync function that might throw into a Result.
 */
export const tryCatchSync = <T>(
  fn: () => T,
  mapError: (e: unknown) => DivbanError
): Result<T, DivbanError> => {
  try {
    const value = fn();
    return Ok(value);
  } catch (e) {
    return Err(mapError(e));
  }
};

/**
 * Execute multiple async operations in sequence, short-circuiting on first error.
 */
export const sequence = async <T, E>(
  operations: readonly (() => Promise<Result<T, E>>)[]
): Promise<Result<T[], E>> => {
  const results: T[] = [];
  for (const op of operations) {
    const result = await op();
    if (!result.ok) {
      return result;
    }
    results.push(result.value);
  }
  return Ok(results);
};

/**
 * Convert a PromiseSettledResult to a Result.
 * Follows the fromNullable pattern for converting external types to Result.
 */
export const fromSettled = <T, E>(
  outcome: PromiseSettledResult<Result<T, E>>,
  mapRejection?: (reason: unknown) => E
): Result<T, E> => {
  if (outcome.status === "fulfilled") {
    return outcome.value;
  }
  if (mapRejection) {
    return Err(mapRejection(outcome.reason));
  }
  throw outcome.reason;
};

/**
 * Execute multiple async operations in parallel, collecting all results or first error.
 * Handles both Err results and promise rejections (converted to Err via mapRejection).
 */
export const parallel = async <T, E>(
  operations: readonly Promise<Result<T, E>>[],
  mapRejection?: (reason: unknown) => E
): Promise<Result<T[], E>> => {
  const settled = await Promise.allSettled(operations);
  const results = settled.map((outcome) => fromSettled(outcome, mapRejection));
  return collectResults(results);
};

/**
 * Check if a result is Ok
 */
export const isOk = <T, E>(result: Result<T, E>): result is { ok: true; value: T } => result.ok;

/**
 * Check if a result is Err
 */
export const isErr = <T, E>(result: Result<T, E>): result is { ok: false; error: E } => !result.ok;

/**
 * Recover from an error by trying an alternative operation.
 * Mirrors Option's `or` combinator for the error case.
 */
export const orElse = <T, E, F>(
  result: Result<T, E>,
  recovery: (error: E) => Result<T, F>
): Result<T, F> => (result.ok ? result : recovery(result.error));

/**
 * Async version of orElse for recovering with async operations.
 */
export const asyncOrElse = async <T, E, F>(
  result: Result<T, E>,
  recovery: (error: E) => Promise<Result<T, F>>
): Promise<Result<T, F>> => (result.ok ? result : recovery(result.error));

/**
 * Retry an operation with exponential backoff on retryable errors.
 * FP-style combinator that composes with Result operations.
 */
export const retry = async <T, E>(
  operation: () => Promise<Result<T, E>>,
  shouldRetry: (error: E, attempt: number) => boolean,
  options: { maxAttempts: number; baseDelayMs: number } = { maxAttempts: 3, baseDelayMs: 50 }
): Promise<Result<T, E>> => {
  let lastError: E | undefined;

  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    const result = await operation();

    if (result.ok) {
      return result;
    }

    if (!shouldRetry(result.error, attempt)) {
      return result;
    }

    lastError = result.error;

    if (attempt < options.maxAttempts - 1) {
      await Bun.sleep(options.baseDelayMs * (attempt + 1));
    }
  }

  // lastError is guaranteed to be set after at least one iteration
  return Err(lastError as E);
};
