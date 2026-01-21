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

import { ErrorCode, GeneralError } from "./errors";

/**
 * Simple Result type for validation functions.
 * This is a minimal implementation kept for type constructor compatibility.
 */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: GeneralError };

const Ok = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
const Err = (error: GeneralError): ValidationResult<never> => ({ ok: false, error });

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
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_HEX_GROUP_REGEX = /^[0-9a-fA-F]{1,4}$/;

/**
 * Type constructors with runtime validation.
 * These provide both type safety and runtime checks.
 */

export const UserId = (n: number): ValidationResult<UserId> => {
  if (!Number.isInteger(n) || n < 0 || n > 65534) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Invalid UserId: ${n}. Must be integer 0-65534.`,
      })
    );
  }
  return Ok(n as UserId);
};

export const GroupId = (n: number): ValidationResult<GroupId> => {
  if (!Number.isInteger(n) || n < 0 || n > 65534) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Invalid GroupId: ${n}. Must be integer 0-65534.`,
      })
    );
  }
  return Ok(n as GroupId);
};

export const SubordinateId = (n: number): ValidationResult<SubordinateId> => {
  if (!Number.isInteger(n) || n < 100000 || n > 4294967294) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Invalid SubordinateId: ${n}. Must be integer 100000-4294967294.`,
      })
    );
  }
  return Ok(n as SubordinateId);
};

export const AbsolutePath = (s: string): ValidationResult<AbsolutePath> => {
  if (!s.startsWith("/")) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Not an absolute path: ${s}. Must start with /.`,
      })
    );
  }
  return Ok(s as AbsolutePath);
};

export const Username = (s: string): ValidationResult<Username> => {
  if (!USERNAME_REGEX.test(s)) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Invalid username: ${s}. Must match [a-z_][a-z0-9_-]*.`,
      })
    );
  }
  if (s.length > 32) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Username too long: ${s}. Max 32 characters.`,
      })
    );
  }
  return Ok(s as Username);
};

export const ServiceName = (s: string): ValidationResult<ServiceName> => {
  if (!SERVICE_NAME_REGEX.test(s)) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Invalid service name: ${s}. Must match [a-z][a-z0-9-]*.`,
      })
    );
  }
  return Ok(s as ServiceName);
};

export const ContainerName = (s: string): ValidationResult<ContainerName> => {
  if (!CONTAINER_NETWORK_VOLUME_REGEX.test(s)) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Invalid container name: ${s}.`,
      })
    );
  }
  return Ok(s as ContainerName);
};

export const NetworkName = (s: string): ValidationResult<NetworkName> => {
  if (!CONTAINER_NETWORK_VOLUME_REGEX.test(s)) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Invalid network name: ${s}.`,
      })
    );
  }
  return Ok(s as NetworkName);
};

export const VolumeName = (s: string): ValidationResult<VolumeName> => {
  if (!CONTAINER_NETWORK_VOLUME_REGEX.test(s)) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Invalid volume name: ${s}.`,
      })
    );
  }
  return Ok(s as VolumeName);
};

/**
 * Type guards for branded types
 */
export const isAbsolutePath = (s: string): s is AbsolutePath => s.startsWith("/");
export const isUsername = (s: string): s is Username => USERNAME_REGEX.test(s) && s.length <= 32;
export const isServiceName = (s: string): s is ServiceName => SERVICE_NAME_REGEX.test(s);

/** Private IPv4 (RFC 1918) or IPv6 (RFC 4193 ULA) address */
export type PrivateIP = string & { readonly __brand: "PrivateIP" };

export const PrivateIP = (s: string): ValidationResult<PrivateIP> => {
  if (typeof s !== "string" || s.length === 0) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: "Invalid PrivateIP: empty or not a string",
      })
    );
  }

  const trimmed = s.trim();

  // Try IPv4 first
  const v4Match = trimmed.match(IPV4_REGEX);
  if (v4Match) {
    const [, ...parts] = v4Match;
    const [a, b, c, d] = parts.map(Number) as [number, number, number, number];

    if ([a, b, c, d].some((n) => n > 255)) {
      return Err(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Invalid PrivateIP: "${s}". Invalid octet value`,
        })
      );
    }

    const isPrivate =
      a === 10 || // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168); // 192.168.0.0/16

    if (!isPrivate) {
      return Err(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Invalid PrivateIP: "${s}". IPv4 must be RFC 1918 (10.x.x.x, 172.16-31.x.x, 192.168.x.x)`,
        })
      );
    }

    return Ok(trimmed as PrivateIP);
  }

  // Try IPv6 - check for ULA prefix (fc00::/7)
  if (trimmed.includes(":")) {
    // Basic IPv6 structure validation
    const groups = trimmed.split("::");
    if (groups.length > 2) {
      return Err(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Invalid PrivateIP: "${s}". Invalid IPv6 format (multiple ::)`,
        })
      );
    }

    const allGroups = groups.flatMap((g) => (g === "" ? [] : g.split(":")));
    const isValidHex = (g: string): boolean => IPV6_HEX_GROUP_REGEX.test(g);

    if (!allGroups.every(isValidHex)) {
      return Err(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Invalid PrivateIP: "${s}". Invalid IPv6 hex group`,
        })
      );
    }

    const maxGroups = groups.length === 2 ? 7 : 8; // :: means at least one group elided
    if (allGroups.length > maxGroups) {
      return Err(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Invalid PrivateIP: "${s}". Too many IPv6 groups`,
        })
      );
    }

    // Check for ULA prefix (fc00::/7 = fc00-fdff)
    const firstGroup = trimmed.split(":")[0];
    if (!firstGroup) {
      return Err(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Invalid PrivateIP: "${s}". Invalid IPv6 format`,
        })
      );
    }
    const firstWord = Number.parseInt(firstGroup.toLowerCase(), 16);

    if (!Number.isNaN(firstWord) && firstWord >= 0xfc00 && firstWord <= 0xfdff) {
      return Ok(trimmed as PrivateIP);
    }

    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Invalid PrivateIP: "${s}". IPv6 must be RFC 4193 ULA (fc00::/7)`,
      })
    );
  }

  return Err(
    new GeneralError({
      code: ErrorCode.INVALID_ARGS as 2,
      message: `Invalid PrivateIP: "${s}". Not a valid IP format`,
    })
  );
};

export const isPrivateIP = (s: string): s is PrivateIP => PrivateIP(s).ok;

// ============================================================================
// UID/GID Conversion Helper
// ============================================================================

/**
 * Convert UserId to GroupId.
 * POSIX convention: GID matches UID for service users.
 */
export const userIdToGroupId = (uid: UserId): GroupId => uid as number as GroupId;

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
 * - AbsolutePath(str) for runtime validation returning ValidationResult
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
  literal as string as AbsolutePath;

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

/**
 * Join path segments into an AbsolutePath.
 * First segment must start with /.
 */
export const joinPath = (...segments: string[]): ValidationResult<AbsolutePath> => {
  if (segments.length === 0) {
    return Err(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: "No path segments provided",
      })
    );
  }
  const joined = segments.join("/").replace(/\/+/g, "/");
  return AbsolutePath(joined);
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
export const assertNever = (x: never, message?: string): never => {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(x)}`);
};
