// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect Schema utilities for divban configuration validation.
 * Provides error formatting, decode helpers, and validation predicates.
 */

import { Effect, Either, ParseResult, Schema } from "effect";
import { ConfigError, ErrorCode } from "./errors";

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * Format Effect Schema parse error to a ConfigError.
 * Output format:
 *   Configuration validation failed for /path/to/file.toml:
 *     - field.path: error message
 *     - other.field: another error
 */
export const formatSchemaError = (error: ParseResult.ParseError, context: string): ConfigError => {
  const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
  return new ConfigError({
    code: ErrorCode.CONFIG_VALIDATION_ERROR as 12,
    message: `Configuration validation failed for ${context}:\n${formatted}`,
    path: context,
  });
};

// ============================================================================
// Decode Utilities
// ============================================================================

/**
 * Decode unknown data synchronously, throwing on error.
 * Use only when input is known valid (e.g., empty object with defaults).
 */
export const decodeUnsafe = <A, I = A>(schema: Schema.Schema<A, I, never>, data: unknown): A =>
  Schema.decodeUnknownSync(schema)(data);

/**
 * Decode unknown data with a schema, returning Effect.
 * Effect version for use in Effect pipelines.
 */
export const decodeToEffect = <A, I = A>(
  schema: Schema.Schema<A, I, never>,
  data: unknown,
  context: string
): Effect.Effect<A, ConfigError> => {
  const result = Schema.decodeUnknownEither(schema)(data);
  return Either.match(result, {
    onLeft: (error): Effect.Effect<A, ConfigError> => {
      const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
      return Effect.fail(
        new ConfigError({
          code: ErrorCode.CONFIG_VALIDATION_ERROR as 12,
          message: `Configuration validation failed for ${context}:\n${formatted}`,
          path: context,
        })
      );
    },
    onRight: (value): Effect.Effect<A, ConfigError> => Effect.succeed(value),
  });
};

// ============================================================================
// Validation Predicates (for Schema.filter)
// ============================================================================

// IP validation regex patterns
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_DOUBLE_COLON_REGEX = /::/g;
const IPV6_HEX_GROUP_REGEX = /^[0-9a-fA-F]{1,4}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate IPv4 address format and octet ranges.
 */
export const isValidIPv4 = (s: string): boolean => {
  const match = s.match(IPV4_REGEX);
  if (!match) {
    return false;
  }
  const [, ...octets] = match;
  return octets.every((o) => {
    const n = Number.parseInt(o, 10);
    return n >= 0 && n <= 255;
  });
};

/**
 * Validate IPv6 address (basic check - allows compressed form with ::).
 */
export const isValidIPv6 = (s: string): boolean => {
  if (!s.includes(":")) {
    return false;
  }
  // Check for multiple :: which is invalid
  const doubleColonCount = (s.match(IPV6_DOUBLE_COLON_REGEX) || []).length;
  if (doubleColonCount > 1) {
    return false;
  }
  // Basic hex group validation
  const groups = s.split("::");
  const allGroups = groups.flatMap((g) => (g === "" ? [] : g.split(":")));
  return allGroups.every((g) => IPV6_HEX_GROUP_REGEX.test(g) || g === "");
};

/**
 * Validate IP address (IPv4 or IPv6).
 */
export const isValidIP = (s: string): boolean => {
  return isValidIPv4(s) || isValidIPv6(s);
};

/**
 * Validate email address format.
 * Uses a practical regex that catches most valid emails.
 */
export const isValidEmail = (s: string): boolean => {
  // RFC 5322 simplified - catches 99% of valid emails
  return EMAIL_REGEX.test(s) && s.length <= 254;
};

/**
 * Validate URL format.
 * Uses URL constructor for validation.
 */
export const isValidUrl = (s: string): boolean => {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
};
