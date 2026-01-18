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
 * Collect an array of Results into a Result of array.
 * Returns the first error encountered, or Ok with all values.
 */
export const collectResults = <T, E>(results: readonly Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return Ok(values);
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
  if (result.ok) return result.value;
  throw result.error;
};

/**
 * Unwrap a result with a default value for errors.
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T =>
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
    if (!result.ok) return result;
    results.push(result.value);
  }
  return Ok(results);
};

/**
 * Execute multiple async operations in parallel, collecting all results or first error.
 */
export const parallel = async <T, E>(
  operations: readonly Promise<Result<T, E>>[]
): Promise<Result<T[], E>> => {
  const results = await Promise.all(operations);
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
