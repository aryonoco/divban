// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Branded/Nominal types for type-safe identifiers.
 */

import { type Brand, Effect, Option, ParseResult, Schema, type SchemaAST, pipe } from "effect";

import { ErrorCode, GeneralError } from "./errors";
import {
  isValidContainerImage,
  isValidContainerName,
  isValidPosixUsername,
  isValidServiceName,
  parseIPv4,
  parseIPv6Groups,
} from "./schema-utils";
import { collapseChar } from "./str-transform";

// ============================================================================
// Branded Type Definitions
// ============================================================================

/** User ID (0-65534 range for POSIX users) */
export type UserId = number & Brand.Brand<"UserId">;

/** Group ID (0-65534 range for POSIX groups) */
export type GroupId = number & Brand.Brand<"GroupId">;

/** Subordinate ID for user namespaces (100000-4294967294 range) */
export type SubordinateId = number & Brand.Brand<"SubordinateId">;

/** Absolute filesystem path (must start with /) */
export type AbsolutePath = string & Brand.Brand<"AbsolutePath">;

/** POSIX username (lowercase, starts with letter or underscore, max 32 chars) */
export type Username = string & Brand.Brand<"Username">;

/** Service name identifier */
export type ServiceName = string & Brand.Brand<"ServiceName">;

/** Container name identifier */
export type ContainerName = string & Brand.Brand<"ContainerName">;

/** Network name identifier */
export type NetworkName = string & Brand.Brand<"NetworkName">;

/** Volume name identifier */
export type VolumeName = string & Brand.Brand<"VolumeName">;

/** Private IPv4 (RFC 1918) or IPv6 (RFC 4193 ULA) address */
export type PrivateIP = string & Brand.Brand<"PrivateIP">;

/** Container image reference (registry/image:tag@sha256:digest) */
export type ContainerImage = string & Brand.Brand<"ContainerImage">;

// ============================================================================
// Message Functions
// ============================================================================

const userIdIntMsg = (): string => "UserId must be an integer";
const userIdRangeMsg = (): string => "UserId must be 0-65534";
const groupIdIntMsg = (): string => "GroupId must be an integer";
const groupIdRangeMsg = (): string => "GroupId must be 0-65534";
const subIdIntMsg = (): string => "SubordinateId must be an integer";
const subIdRangeMsg = (): string => "SubordinateId must be 100000-4294967294";
const absolutePathMsg = (): string => "Path must be absolute (start with /)";
const usernamePatternMsg = (): string => "Username must match [a-z_][a-z0-9_-]*";
const usernameMaxLenMsg = (): string => "Username max 32 characters";
const serviceNamePatternMsg = (): string => "Service name must match [a-z][a-z0-9-]*";
const containerNameMsg = (): string => "Invalid container name";
const networkNameMsg = (): string => "Invalid network name";
const volumeNameMsg = (): string => "Invalid volume name";
const privateIPEmptyMsg = (): string => "IP address cannot be empty";
const privateIPInvalidMsg = (): string => "Must be RFC 1918 IPv4 or RFC 4193 IPv6";
const containerImageMsg = (): string => "Invalid container image format";

// ============================================================================
// Numeric Branded Schemas
// ============================================================================

/** User ID schema (0-65534 range for POSIX users) */
export const UserIdSchema: Schema.BrandSchema<UserId, number, never> = Schema.Number.pipe(
  Schema.int({ message: userIdIntMsg }),
  Schema.between(0, 65534, { message: userIdRangeMsg }),
  Schema.brand("UserId")
);

/** Group ID schema (0-65534 range for POSIX groups) */
export const GroupIdSchema: Schema.BrandSchema<GroupId, number, never> = Schema.Number.pipe(
  Schema.int({ message: groupIdIntMsg }),
  Schema.between(0, 65534, { message: groupIdRangeMsg }),
  Schema.brand("GroupId")
);

/** Subordinate ID schema for user namespaces (100000-4294967294 range) */
export const SubordinateIdSchema: Schema.BrandSchema<SubordinateId, number, never> =
  Schema.Number.pipe(
    Schema.int({ message: subIdIntMsg }),
    Schema.between(100000, 4294967294, { message: subIdRangeMsg }),
    Schema.brand("SubordinateId")
  );

// ============================================================================
// String Branded Schemas
// ============================================================================

/** Absolute filesystem path schema (must start with /) */
export const AbsolutePathSchema: Schema.BrandSchema<AbsolutePath, string, never> =
  Schema.String.pipe(
    Schema.filter((s): boolean => s.startsWith("/"), { message: absolutePathMsg }),
    Schema.brand("AbsolutePath")
  );

/** POSIX username schema (lowercase, starts with letter or underscore, max 32 chars) */
export const UsernameSchema: Schema.BrandSchema<Username, string, never> = Schema.String.pipe(
  Schema.filter(isValidPosixUsername, { message: usernamePatternMsg }),
  Schema.maxLength(32, { message: usernameMaxLenMsg }),
  Schema.brand("Username")
);

/** Service name schema */
export const ServiceNameSchema: Schema.BrandSchema<ServiceName, string, never> = Schema.String.pipe(
  Schema.filter(isValidServiceName, { message: serviceNamePatternMsg }),
  Schema.brand("ServiceName")
);

/** Container name schema */
export const ContainerNameSchema: Schema.BrandSchema<ContainerName, string, never> =
  Schema.String.pipe(
    Schema.filter(isValidContainerName, { message: containerNameMsg }),
    Schema.brand("ContainerName")
  );

/** Network name schema */
export const NetworkNameSchema: Schema.BrandSchema<NetworkName, string, never> = Schema.String.pipe(
  Schema.filter(isValidContainerName, { message: networkNameMsg }),
  Schema.brand("NetworkName")
);

/** Volume name schema */
export const VolumeNameSchema: Schema.BrandSchema<VolumeName, string, never> = Schema.String.pipe(
  Schema.filter(isValidContainerName, { message: volumeNameMsg }),
  Schema.brand("VolumeName")
);

/** Container image schema (registry/image:tag@sha256:digest) */
export const ContainerImageSchema: Schema.BrandSchema<ContainerImage, string, never> =
  Schema.String.pipe(
    Schema.filter(isValidContainerImage, { message: containerImageMsg }),
    Schema.brand("ContainerImage")
  );

// ============================================================================
// Duration String Types
// ============================================================================

/** Branded duration string for runtime validation */
export type DurationString = string & Brand.Brand<"DurationString">;

/** Duration pattern: digits followed by unit */
const DURATION_PATTERN = /^[0-9]+(?:ms|s|m|h|d)$/;

const durationMsg = (): string => "Duration must be number followed by unit (ms, s, m, h, d)";

export const DurationStringSchema: Schema.BrandSchema<DurationString, string, never> =
  Schema.String.pipe(
    Schema.filter((s): boolean => DURATION_PATTERN.test(s), { message: durationMsg }),
    Schema.brand("DurationString")
  );

export const isDurationString: (u: unknown) => u is DurationString =
  Schema.is(DurationStringSchema);

export const decodeDurationString: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<DurationString, ParseResult.ParseError, never> =
  Schema.decode(DurationStringSchema);

/**
 * Compile-time validated duration literal.
 * Template literal type restricts to valid patterns.
 */
export const duration = <const S extends `${number}${"ms" | "s" | "m" | "h" | "d"}`>(
  literal: S
): DurationString => literal as string as DurationString;

// ============================================================================
// PrivateIP Branded Schema
// ============================================================================

/** Private IPv4 (RFC 1918) validation using parser */
const isRfc1918IPv4 = (s: string): boolean => {
  const result = parseIPv4(s);
  if (Option.isNone(result)) {
    return false;
  }
  const [a, b] = result.value;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

/** Private IPv6 (RFC 4193 ULA) validation using parser */
const isRfc4193IPv6 = (s: string): boolean => {
  const result = parseIPv6Groups(s);
  if (Option.isNone(result)) {
    return false;
  }
  const firstGroup = s.split(":")[0];
  if (!firstGroup) {
    return false;
  }
  const firstWord = Number.parseInt(firstGroup.toLowerCase(), 16);
  return !Number.isNaN(firstWord) && firstWord >= 0xfc00 && firstWord <= 0xfdff;
};

/** Check if string is a valid private IP */
const isPrivateIPString = (s: string): boolean => isRfc1918IPv4(s) || isRfc4193IPv6(s);

/** Decode function for PrivateIP transform */
const trimString = (s: string): string => s.trim();

/** Encode function for PrivateIP transform (identity) */
const identityString = (s: string): string => s;

/** Private IP schema (RFC 1918 IPv4 or RFC 4193 IPv6) */
export const PrivateIPSchema: Schema.Schema<PrivateIP, string> = Schema.String.pipe(
  Schema.nonEmptyString({ message: privateIPEmptyMsg }),
  Schema.transform(Schema.String, {
    strict: true,
    decode: trimString,
    encode: identityString,
  }),
  Schema.filter(isPrivateIPString, { message: privateIPInvalidMsg }),
  Schema.brand("PrivateIP")
);

// ============================================================================
// Type Guards
// ============================================================================
// Schema.is(schema) returns (u: unknown) => u is A - a type guard predicate

export const isUserId: (u: unknown) => u is UserId = Schema.is(UserIdSchema);
export const isGroupId: (u: unknown) => u is GroupId = Schema.is(GroupIdSchema);
export const isSubordinateId: (u: unknown) => u is SubordinateId = Schema.is(SubordinateIdSchema);
export const isAbsolutePath: (u: unknown) => u is AbsolutePath = Schema.is(AbsolutePathSchema);
export const isUsername: (u: unknown) => u is Username = Schema.is(UsernameSchema);
export const isServiceName: (u: unknown) => u is ServiceName = Schema.is(ServiceNameSchema);
export const isContainerName: (u: unknown) => u is ContainerName = Schema.is(ContainerNameSchema);
export const isNetworkName: (u: unknown) => u is NetworkName = Schema.is(NetworkNameSchema);
export const isVolumeName: (u: unknown) => u is VolumeName = Schema.is(VolumeNameSchema);
export const isPrivateIP: (u: unknown) => u is PrivateIP = Schema.is(PrivateIPSchema);
export const isContainerImage: (u: unknown) => u is ContainerImage =
  Schema.is(ContainerImageSchema);

// ============================================================================
// Effect-Based Decoders (for untrusted input in Effect pipelines)
// ============================================================================
// Usage: yield* decodeUserId(untrustedInput).pipe(Effect.mapError(parseErrorToGeneralError))

export const decodeUserId: (
  i: number,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<UserId, ParseResult.ParseError, never> = Schema.decode(UserIdSchema);

export const decodeGroupId: (
  i: number,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<GroupId, ParseResult.ParseError, never> = Schema.decode(GroupIdSchema);

export const decodeSubordinateId: (
  i: number,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<SubordinateId, ParseResult.ParseError, never> =
  Schema.decode(SubordinateIdSchema);

export const decodeAbsolutePath: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<AbsolutePath, ParseResult.ParseError, never> = Schema.decode(AbsolutePathSchema);

export const decodeUsername: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<Username, ParseResult.ParseError, never> = Schema.decode(UsernameSchema);

export const decodeServiceName: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<ServiceName, ParseResult.ParseError, never> = Schema.decode(ServiceNameSchema);

export const decodeContainerName: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<ContainerName, ParseResult.ParseError, never> =
  Schema.decode(ContainerNameSchema);

export const decodeNetworkName: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<NetworkName, ParseResult.ParseError, never> = Schema.decode(NetworkNameSchema);

export const decodeVolumeName: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<VolumeName, ParseResult.ParseError, never> = Schema.decode(VolumeNameSchema);

export const decodePrivateIP: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<PrivateIP, ParseResult.ParseError, never> = Schema.decode(PrivateIPSchema);

export const decodeContainerImage: (
  i: string,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<ContainerImage, ParseResult.ParseError, never> =
  Schema.decode(ContainerImageSchema);

// ============================================================================
// Error Conversion Helper
// ============================================================================

/**
 * Convert ParseError to GeneralError for Effect pipelines.
 * Used with Effect.mapError to translate Schema validation errors.
 */
export const parseErrorToGeneralError = (error: ParseResult.ParseError): GeneralError => {
  const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
  return new GeneralError({
    code: ErrorCode.INVALID_ARGS as 2,
    message: formatted,
  });
};

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
 * - decodeAbsolutePath(str) for runtime validation returning Effect
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

/**
 * Create a ContainerImage from a string literal.
 *
 * For default values and known images, use this function.
 * For dynamic/user input, use decodeContainerImage() for runtime validation.
 *
 * @example
 * const image = containerImage("docker.io/library/nginx:latest");
 */
export const containerImage = <const S extends string>(literal: S): ContainerImage =>
  literal as string as ContainerImage;

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
  // Normalize multiple slashes using fold-based collapseChar
  return pipe([base, ...segments].join("/"), collapseChar("/"));
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
export const joinPath = (...segments: string[]): Effect.Effect<AbsolutePath, GeneralError> =>
  segments.length === 0
    ? Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "No path segments provided",
        })
      )
    : decodeAbsolutePath(pipe(segments.join("/"), collapseChar("/"))).pipe(
        Effect.mapError(parseErrorToGeneralError)
      );

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
