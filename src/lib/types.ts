// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Branded/Nominal types for type-safe identifiers.
 * These prevent accidentally mixing incompatible values like UIDs and GIDs.
 */

import { DivbanError, ErrorCode } from "./errors";
import { None, type Option, Some } from "./option";
import { Err, Ok, type Result } from "./result";

/** User ID (1000-65534 range for regular users) */
export type UserId = number & { readonly __brand: "UserId" };

/** Group ID (1000-65534 range for regular groups) */
export type GroupId = number & { readonly __brand: "GroupId" };

/** Subordinate ID for user namespaces (100000+ range) */
export type SubordinateId = number & { readonly __brand: "SubordinateId" };

/** Absolute filesystem path (must start with /) */
export type AbsolutePath = string & { readonly __brand: "AbsolutePath" };

/** POSIX username (lowercase, starts with letter or underscore) */
export type Username = string & { readonly __brand: "Username" };

/** Service name identifier */
export type ServiceName = string & { readonly __brand: "ServiceName" };

/** Container name identifier */
export type ContainerName = string & { readonly __brand: "ContainerName" };

/** Network name identifier */
export type NetworkName = string & { readonly __brand: "NetworkName" };

/** Volume name identifier */
export type VolumeName = string & { readonly __brand: "VolumeName" };

/**
 * Regex patterns for validation (top-level for performance)
 */
const USERNAME_REGEX = /^[a-z_][a-z0-9_-]*$/;
const SERVICE_NAME_REGEX = /^[a-z][a-z0-9-]*$/;
const CONTAINER_NETWORK_VOLUME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/**
 * Type constructors with runtime validation.
 * These provide both type safety and runtime checks.
 */

export const UserId = (n: number): Result<UserId, DivbanError> => {
  if (!Number.isInteger(n) || n < 0 || n > 65534) {
    return Err(
      new DivbanError(ErrorCode.INVALID_ARGS, `Invalid UserId: ${n}. Must be integer 0-65534.`)
    );
  }
  return Ok(n as UserId);
};

export const GroupId = (n: number): Result<GroupId, DivbanError> => {
  if (!Number.isInteger(n) || n < 0 || n > 65534) {
    return Err(
      new DivbanError(ErrorCode.INVALID_ARGS, `Invalid GroupId: ${n}. Must be integer 0-65534.`)
    );
  }
  return Ok(n as GroupId);
};

export const SubordinateId = (n: number): Result<SubordinateId, DivbanError> => {
  if (!Number.isInteger(n) || n < 100000 || n > 4294967294) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        `Invalid SubordinateId: ${n}. Must be integer 100000-4294967294.`
      )
    );
  }
  return Ok(n as SubordinateId);
};

export const AbsolutePath = (s: string): Result<AbsolutePath, DivbanError> => {
  if (!s.startsWith("/")) {
    return Err(
      new DivbanError(ErrorCode.INVALID_ARGS, `Not an absolute path: ${s}. Must start with /.`)
    );
  }
  return Ok(s as AbsolutePath);
};

export const Username = (s: string): Result<Username, DivbanError> => {
  if (!USERNAME_REGEX.test(s)) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        `Invalid username: ${s}. Must match [a-z_][a-z0-9_-]*.`
      )
    );
  }
  if (s.length > 32) {
    return Err(
      new DivbanError(ErrorCode.INVALID_ARGS, `Username too long: ${s}. Max 32 characters.`)
    );
  }
  return Ok(s as Username);
};

export const ServiceName = (s: string): Result<ServiceName, DivbanError> => {
  if (!SERVICE_NAME_REGEX.test(s)) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        `Invalid service name: ${s}. Must match [a-z][a-z0-9-]*.`
      )
    );
  }
  return Ok(s as ServiceName);
};

export const ContainerName = (s: string): Result<ContainerName, DivbanError> => {
  if (!CONTAINER_NETWORK_VOLUME_REGEX.test(s)) {
    return Err(new DivbanError(ErrorCode.INVALID_ARGS, `Invalid container name: ${s}.`));
  }
  return Ok(s as ContainerName);
};

export const NetworkName = (s: string): Result<NetworkName, DivbanError> => {
  if (!CONTAINER_NETWORK_VOLUME_REGEX.test(s)) {
    return Err(new DivbanError(ErrorCode.INVALID_ARGS, `Invalid network name: ${s}.`));
  }
  return Ok(s as NetworkName);
};

export const VolumeName = (s: string): Result<VolumeName, DivbanError> => {
  if (!CONTAINER_NETWORK_VOLUME_REGEX.test(s)) {
    return Err(new DivbanError(ErrorCode.INVALID_ARGS, `Invalid volume name: ${s}.`));
  }
  return Ok(s as VolumeName);
};

/**
 * Type guards for branded types
 */
export const isAbsolutePath = (s: string): s is AbsolutePath => s.startsWith("/");
export const isUsername = (s: string): s is Username => USERNAME_REGEX.test(s) && s.length <= 32;
export const isServiceName = (s: string): s is ServiceName => SERVICE_NAME_REGEX.test(s);

// ============================================================================
// UID/GID Conversion Helper
// ============================================================================

/**
 * Convert UserId to GroupId.
 * POSIX convention: GID matches UID for service users.
 */
export const userIdToGroupId = (uid: UserId): GroupId => uid as unknown as GroupId;

// ============================================================================
// Compile-Time Path Validation
// ============================================================================

/**
 * Template literal type that matches absolute path patterns.
 * Used for compile-time validation of path literals.
 */
type AbsolutePathLiteral = `/${string}`;

/**
 * Create an AbsolutePath from a string literal with compile-time validation.
 *
 * This function only accepts string literals that start with '/'.
 * Variables are rejected because their values aren't known at compile time.
 *
 * Use cases:
 * - Hardcoded system paths: path("/etc/passwd")
 * - Test fixtures: path("/tmp/test-dir")
 * - Known config locations: path("/etc/divban")
 *
 * For dynamic paths (variables, user input), use:
 * - AbsolutePath(str) for runtime validation returning Result
 * - pathJoin(base, ...segments) for path concatenation
 *
 * @example
 * // Compiles - literal starting with /
 * const passwd = path("/etc/passwd");
 *
 * // Compile error - doesn't start with /
 * const bad = path("relative/path");
 *
 * // Compile error - variable (even if it starts with /)
 * const str = "/etc/hosts";
 * const hosts = path(str);  // Error: string is not assignable to `/${string}`
 */
export const path = <const S extends AbsolutePathLiteral>(literal: S): AbsolutePath =>
  literal as unknown as AbsolutePath;

// ============================================================================
// Type-Safe Path Concatenation
// ============================================================================

/**
 * Join path segments with type preservation.
 *
 * When the base is an AbsolutePath, the result is also an AbsolutePath.
 * When the base is a plain string, the result is a plain string.
 *
 * This allows safe path construction without losing type information:
 *
 * @example
 * const dataDir: AbsolutePath = path("/srv/data");
 *
 * // Result is AbsolutePath (not string)
 * const configDir = pathJoin(dataDir, "config");
 * const backupPath = pathJoin(dataDir, "backups", "2024-01-01.tar.gz");
 *
 * // Multiple segments work
 * const deep = pathJoin(dataDir, "a", "b", "c", "file.txt");
 *
 * // Plain strings stay as strings
 * const relative = pathJoin("foo", "bar");  // string
 */
export function pathJoin(base: AbsolutePath, ...segments: string[]): AbsolutePath;
export function pathJoin(base: string, ...segments: string[]): string;
export function pathJoin(base: string, ...segments: string[]): string {
  if (segments.length === 0) {
    return base;
  }
  const joined = [base, ...segments].join("/");
  // Normalize multiple slashes but preserve leading slash
  return joined.replace(/\/+/g, "/");
}

/**
 * Append a suffix to a path (e.g., for temp files or backups).
 * Preserves AbsolutePath brand.
 *
 * @example
 * const file: AbsolutePath = path("/etc/config.toml");
 * const backup = pathWithSuffix(file, ".bak");      // "/etc/config.toml.bak"
 * const temp = pathWithSuffix(file, `.tmp.${id}`);  // "/etc/config.toml.tmp.123"
 */
export function pathWithSuffix(base: AbsolutePath, suffix: string): AbsolutePath;
export function pathWithSuffix(base: string, suffix: string): string;
export function pathWithSuffix(base: string, suffix: string): string {
  return `${base}${suffix}`;
}

// ============================================================================
// Path Construction Helpers (Legacy)
// ============================================================================

/**
 * Unwrap AbsolutePath Result or throw.
 * Use only for compile-time known valid paths (string literals starting with /).
 *
 * @deprecated Use path() for string literals with compile-time validation.
 */
export const unsafePath = (s: string): AbsolutePath => {
  const result = AbsolutePath(s);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

/**
 * Join path segments into an AbsolutePath.
 * First segment must start with /.
 */
export const joinPath = (...segments: string[]): Result<AbsolutePath, DivbanError> => {
  if (segments.length === 0) {
    return Err(new DivbanError(ErrorCode.INVALID_ARGS, "No path segments provided"));
  }
  const joined = segments.join("/").replace(/\/+/g, "/");
  return AbsolutePath(joined);
};

/**
 * Join paths unsafely (throws on invalid).
 * Use only when all segments are known valid at compile time.
 *
 * @deprecated Use pathJoin() for type-preserving path concatenation.
 */
export const unsafeJoinPath = (...segments: string[]): AbsolutePath => {
  const result = joinPath(...segments);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

// ============================================================================
// Environment Variable Helpers (using Bun.env)
// ============================================================================

/**
 * Get an environment variable value.
 */
export const getEnv = (key: string): Option<string> => {
  const value = Bun.env[key];
  return value === undefined ? None : Some(value);
};

/**
 * Get a required environment variable, throwing if not set.
 */
export const requireEnv = (key: string): string => {
  const value = Bun.env[key];
  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
};

/**
 * Get environment variable with a default fallback.
 */
export const getEnvOrDefault = (key: string, defaultValue: string): string => {
  return Bun.env[key] ?? defaultValue;
};

// ============================================================================
// Exhaustiveness Checking
// ============================================================================

/**
 * Exhaustiveness helper for switch statements on discriminated unions.
 * TypeScript will error at compile time if a case is not handled.
 *
 * @example
 * type Status = { type: 'running' } | { type: 'stopped' };
 *
 * const handle = (s: Status) => {
 *   switch (s.type) {
 *     case 'running': return 'Running';
 *     case 'stopped': return 'Stopped';
 *     default: return assertNever(s);
 *   }
 * };
 */
export const assertNever = (x: never): never => {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
};
