// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect Schema utilities for divban configuration validation.
 * Provides error formatting, decode helpers, and validation predicates.
 *
 * Uses parser-first design: parsers return structured data via Option,
 * validators derive from parsers via Option.isSome.
 */

import { Array as Arr, Effect, Either, Option, ParseResult, Schema, pipe } from "effect";
import {
  isAlphaNum,
  isDigit,
  isHexDigit,
  isLower,
  isLowerHex,
  isOneOf,
  isWhitespace,
} from "./char";
import { ConfigError, ErrorCode } from "./errors";
import { all, uncons } from "./str";

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
// Parsing Primitives
// ============================================================================

/**
 * Parse a natural number (non-negative integer) from string.
 * Returns None for empty, non-digit, or leading zeros (except "0").
 */
export const parseNat = (s: string): Option.Option<number> => {
  if (s.length === 0) {
    return Option.none();
  }
  if (!all(isDigit)(s)) {
    return Option.none();
  }
  // Reject leading zeros except "0" itself
  if (s.length > 1 && s.startsWith("0")) {
    return Option.none();
  }
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? Option.none() : Option.some(n);
};

/**
 * Parse an octet (0-255).
 */
export const parseOctet = (s: string): Option.Option<number> =>
  pipe(
    parseNat(s),
    Option.filter((n) => n <= 255)
  );

// ============================================================================
// IPv4 Parsing
// ============================================================================

/** Branded type for parsed IPv4 */
export type IPv4Octets = readonly [number, number, number, number];

/**
 * Parse IPv4 into structured octets.
 * "192.168.1.1" -> Some([192, 168, 1, 1])
 */
export const parseIPv4 = (s: string): Option.Option<IPv4Octets> => {
  const parts = s.split(".");
  if (parts.length !== 4) {
    return Option.none();
  }

  const octets = pipe(parts, Arr.filterMap(parseOctet));

  return octets.length === 4 ? Option.some(octets as unknown as IPv4Octets) : Option.none();
};

/** Validator derived from parser */
export const isValidIPv4 = (s: string): boolean => Option.isSome(parseIPv4(s));

// ============================================================================
// IPv6 Parsing
// ============================================================================

/** Check if string is valid hex group (1-4 hex digits) */
const isHexGroup = (s: string): boolean => s.length > 0 && s.length <= 4 && all(isHexDigit)(s);

/** Count non-overlapping occurrences of substring */
const countSubstring =
  (sub: string) =>
  (s: string): number => {
    if (sub.length === 0) {
      return 0;
    }
    let count = 0;
    let pos = s.indexOf(sub, 0);
    while (pos !== -1) {
      count++;
      pos = s.indexOf(sub, pos + sub.length);
    }
    return count;
  };

/**
 * Validate IPv6 address (allows :: compression).
 * Parser returns Option<readonly string[]> of normalized groups.
 */
export const parseIPv6Groups = (s: string): Option.Option<readonly string[]> => {
  if (!s.includes(":")) {
    return Option.none();
  }
  if (countSubstring("::")(s) > 1) {
    return Option.none();
  }

  const groups = s.split("::").flatMap((g) => (g === "" ? [] : g.split(":")));
  const maxGroups = s.includes("::") ? 7 : 8;

  if (groups.length > maxGroups) {
    return Option.none();
  }
  if (!groups.every((g) => isHexGroup(g) || g === "")) {
    return Option.none();
  }

  return Option.some(groups);
};

export const isValidIPv6 = (s: string): boolean => Option.isSome(parseIPv6Groups(s));
export const isValidIP = (s: string): boolean => isValidIPv4(s) || isValidIPv6(s);

// ============================================================================
// Email Parsing
// ============================================================================

/** Parsed email structure */
export interface ParsedEmail {
  readonly local: string;
  readonly domain: string;
}

/** Valid email character (non-whitespace, non-@) */
const isEmailChar = (c: string): boolean => !isWhitespace(c) && c !== "@";

/**
 * Parse email into local@domain structure.
 */
export const parseEmail = (s: string): Option.Option<ParsedEmail> => {
  if (s.length === 0 || s.length > 254) {
    return Option.none();
  }

  const atIdx = s.indexOf("@");
  if (atIdx < 1) {
    return Option.none();
  }

  const local = s.slice(0, atIdx);
  const domain = s.slice(atIdx + 1);

  if (!all(isEmailChar)(local)) {
    return Option.none();
  }
  if (!all(isEmailChar)(domain)) {
    return Option.none();
  }

  const dotIdx = domain.indexOf(".");
  if (dotIdx <= 0 || dotIdx >= domain.length - 1) {
    return Option.none();
  }

  return Option.some({ local, domain });
};

export const isValidEmail = (s: string): boolean => Option.isSome(parseEmail(s));

// ============================================================================
// Name Parsers
// ============================================================================

/** Valid first char for POSIX username: [a-z_] */
const isPosixFirst = (c: string): boolean => isLower(c) || c === "_";

/** Valid rest char for POSIX username: [a-z0-9_-] */
const isPosixRest = (c: string): boolean => isLower(c) || isDigit(c) || c === "_" || c === "-";

/**
 * Parse POSIX username using uncons for safe head access.
 */
export const parsePosixUsername = (s: string): Option.Option<string> =>
  pipe(
    uncons(s),
    Option.filter((tuple) => isPosixFirst(tuple[0])),
    Option.filter((tuple) => all(isPosixRest)(tuple[1])),
    Option.map(() => s)
  );

export const isValidPosixUsername = (s: string): boolean => Option.isSome(parsePosixUsername(s));

/** Valid first char for service name: [a-z] */
const isServiceFirst = isLower;

/** Valid rest char for service name: [a-z0-9-] */
const isServiceRest = (c: string): boolean => isLower(c) || isDigit(c) || c === "-";

export const parseServiceName = (s: string): Option.Option<string> =>
  pipe(
    uncons(s),
    Option.filter((tuple) => isServiceFirst(tuple[0])),
    Option.filter((tuple) => all(isServiceRest)(tuple[1])),
    Option.map(() => s)
  );

export const isValidServiceName = (s: string): boolean => Option.isSome(parseServiceName(s));

/** Valid first char for container/network/volume name: [a-zA-Z0-9] */
const isContainerFirst = isAlphaNum;

/** Valid rest char: [a-zA-Z0-9_.-] */
const isContainerRest = (c: string): boolean => isAlphaNum(c) || isOneOf("_.-")(c);

export const parseContainerName = (s: string): Option.Option<string> =>
  pipe(
    uncons(s),
    Option.filter((tuple) => isContainerFirst(tuple[0])),
    Option.filter((tuple) => all(isContainerRest)(tuple[1])),
    Option.map(() => s)
  );

export const isValidContainerName = (s: string): boolean => Option.isSome(parseContainerName(s));

// ============================================================================
// Container Image Parser
// ============================================================================

/** Parsed container image structure */
export interface ParsedContainerImage {
  readonly name: string;
  readonly tag: Option.Option<string>;
  readonly digest: Option.Option<string>;
}

/** Valid image name char: [a-zA-Z0-9_./-] */
const isImageNameChar = (c: string): boolean => isAlphaNum(c) || isOneOf("_./-")(c);

/** Valid tag char: [a-zA-Z0-9_.-] */
const isTagChar = (c: string): boolean => isAlphaNum(c) || isOneOf("_.-")(c);

/**
 * Parse container image: name[:tag][@sha256:digest]
 */
export const parseContainerImage = (s: string): Option.Option<ParsedContainerImage> => {
  let remaining = s;
  let digest: Option.Option<string> = Option.none();

  // Extract @sha256:digest if present
  const digestIdx = s.indexOf("@sha256:");
  if (digestIdx !== -1) {
    const digestStr = s.slice(digestIdx + 8);
    if (digestStr.length === 0) {
      return Option.none();
    }
    if (!all(isLowerHex)(digestStr)) {
      return Option.none();
    }
    digest = Option.some(digestStr);
    remaining = s.slice(0, digestIdx);
  }

  // Extract :tag if present
  let tag: Option.Option<string> = Option.none();
  const colonIdx = remaining.indexOf(":");
  let name: string;

  if (colonIdx !== -1) {
    const tagStr = remaining.slice(colonIdx + 1);
    if (tagStr.length === 0) {
      return Option.none();
    }
    if (!all(isTagChar)(tagStr)) {
      return Option.none();
    }
    tag = Option.some(tagStr);
    name = remaining.slice(0, colonIdx);
  } else {
    name = remaining;
  }

  // Validate name
  if (name.length === 0) {
    return Option.none();
  }
  if (!all(isImageNameChar)(name)) {
    return Option.none();
  }

  return Option.some({ name, tag, digest });
};

export const isValidContainerImage = (s: string): boolean => Option.isSome(parseContainerImage(s));

// ============================================================================
// URL Validation
// ============================================================================

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
