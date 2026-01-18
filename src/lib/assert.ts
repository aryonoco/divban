/**
 * Assertion utilities for runtime type checking and exhaustive pattern matching.
 */

import { DivbanError, ErrorCode } from "./errors";
import { Err, Ok, type Result } from "./result";

/**
 * Assert that a value is never reached.
 * Used for exhaustive pattern matching in switch/if statements.
 *
 * @example
 * type Status = "running" | "stopped";
 * function handleStatus(status: Status) {
 *   switch (status) {
 *     case "running": return "Running";
 *     case "stopped": return "Stopped";
 *     default: assertNever(status);
 *   }
 * }
 */
export const assertNever = (value: never, message?: string): never => {
  throw new DivbanError(
    ErrorCode.GENERAL_ERROR,
    message ?? `Unexpected value: ${JSON.stringify(value)}`
  );
};

/**
 * Assert that a condition is true at runtime.
 * Throws DivbanError if the assertion fails.
 */
export const assert = (
  condition: boolean,
  message: string,
  code: (typeof ErrorCode)[keyof typeof ErrorCode] = ErrorCode.GENERAL_ERROR
): asserts condition => {
  if (!condition) {
    throw new DivbanError(code, message);
  }
};

/**
 * Assert that a value is not null or undefined.
 * Returns the value with null/undefined removed from the type.
 */
export const assertDefined = <T>(
  value: T | null | undefined,
  message: string
): T => {
  if (value === null || value === undefined) {
    throw new DivbanError(ErrorCode.GENERAL_ERROR, message);
  }
  return value;
};

/**
 * Safe version of assertDefined that returns a Result.
 */
export const ensureDefined = <T>(
  value: T | null | undefined,
  message: string
): Result<T, DivbanError> => {
  if (value === null || value === undefined) {
    return Err(new DivbanError(ErrorCode.GENERAL_ERROR, message));
  }
  return Ok(value);
};

/**
 * Type guard for checking if a value is an object with specific keys.
 */
export const hasKeys = <K extends string>(
  value: unknown,
  keys: K[]
): value is Record<K, unknown> => {
  if (typeof value !== "object" || value === null) return false;
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
export const isOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[]
): value is T => typeof value === "string" && allowed.includes(value as T);

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
    throw new DivbanError(ErrorCode.GENERAL_ERROR, message);
  }
  return arr;
};
