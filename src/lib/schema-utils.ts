// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect Schema utilities with parser-first validation design.
 * Parsers return Option<StructuredData> for safe extraction; validators
 * derive from parsers via Option.isSome. This avoids regex complexity
 * and provides useful parsed data when validation succeeds.
 */

import { Effect, Either, Option, ParseResult, Schema, pipe } from "effect";
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
export const parseNat = (s: string): Option.Option<number> =>
  pipe(
    Option.some(s),
    Option.filter((str) => str.length > 0),
    Option.filter(all(isDigit)),
    Option.filter((str) => str.length === 1 || !str.startsWith("0")),
    Option.map((str) => Number.parseInt(str, 10)),
    Option.filter((n) => !Number.isNaN(n))
  );

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
export const parseIPv4 = (s: string): Option.Option<IPv4Octets> =>
  pipe(
    Option.some(s.split(".")),
    Option.filter((parts) => parts.length === 4),
    Option.flatMap((parts) =>
      pipe(
        Option.all([
          parseOctet(parts[0] ?? ""),
          parseOctet(parts[1] ?? ""),
          parseOctet(parts[2] ?? ""),
          parseOctet(parts[3] ?? ""),
        ]),
        Option.map((octets) => octets as IPv4Octets)
      )
    )
  );

/** Validator derived from parser */
export const isValidIPv4 = (s: string): boolean => Option.isSome(parseIPv4(s));

// ============================================================================
// IPv6 Parsing
// ============================================================================

/** Check if string is valid hex group (1-4 hex digits) */
const isHexGroup = (s: string): boolean => s.length > 0 && s.length <= 4 && all(isHexDigit)(s);

/** State for substring counting */
type CountState = { readonly pos: number; readonly count: number };

/** Step function: find next match and advance state */
const countStep =
  (sub: string, s: string) =>
  (state: CountState): CountState => {
    const idx = s.indexOf(sub, state.pos);
    return idx === -1
      ? state
      : countStep(sub, s)({ pos: idx + sub.length, count: state.count + 1 });
  };

/** Count non-overlapping occurrences of substring */
const countSubstring =
  (sub: string) =>
  (s: string): number =>
    sub.length === 0 ? 0 : countStep(sub, s)({ pos: 0, count: 0 }).count;

/** State for IPv6 parsing */
interface IPv6ParseState {
  readonly groups: readonly string[];
  readonly hasDoubleColon: boolean;
}

/** Build IPv6 parse state from input string */
const buildIPv6State = (s: string): IPv6ParseState => ({
  groups: s.split("::").flatMap((g) => (g === "" ? [] : g.split(":"))),
  hasDoubleColon: s.includes("::"),
});

/** Maximum allowed groups based on compression */
const maxGroupsFor = (state: IPv6ParseState): number => (state.hasDoubleColon ? 7 : 8);

/**
 * Validate IPv6 address (allows :: compression).
 * Parser returns Option<readonly string[]> of normalized groups.
 */
export const parseIPv6Groups = (s: string): Option.Option<readonly string[]> =>
  pipe(
    Option.some(s),
    Option.filter((str) => str.includes(":")),
    Option.filter((str) => countSubstring("::")(str) <= 1),
    Option.map(buildIPv6State),
    Option.filter((state) => state.groups.length <= maxGroupsFor(state)),
    Option.filter((state) => state.groups.every((g) => isHexGroup(g) || g === "")),
    Option.map((state) => state.groups)
  );

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

/** State for email parsing */
interface EmailParseState {
  readonly local: string;
  readonly domain: string;
}

/** Build email parse state from input string */
const buildEmailState = (s: string): EmailParseState => {
  const atIdx = s.indexOf("@");
  return {
    local: s.slice(0, Math.max(0, atIdx)),
    domain: s.slice(atIdx + 1),
  };
};

/** Check if domain has a dot in a valid position (not first or last) */
const hasDotInMiddle = (domain: string): boolean => {
  const dotIdx = domain.indexOf(".");
  return dotIdx > 0 && dotIdx < domain.length - 1;
};

/**
 * Parse email into local@domain structure.
 */
export const parseEmail = (s: string): Option.Option<ParsedEmail> =>
  pipe(
    Option.some(s),
    Option.filter((str) => str.length > 0 && str.length <= 254),
    Option.filter((str) => str.indexOf("@") >= 1),
    Option.map(buildEmailState),
    Option.filter((state) => all(isEmailChar)(state.local)),
    Option.filter((state) => all(isEmailChar)(state.domain)),
    Option.filter((state) => hasDotInMiddle(state.domain)),
    Option.map((state): ParsedEmail => ({ local: state.local, domain: state.domain }))
  );

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

/** State for container image parsing */
interface ImageParserState {
  readonly remaining: string;
  readonly digest: Option.Option<string>;
  readonly tag: Option.Option<string>;
}

/** Initial state from input string */
const initialImageState = (s: string): ImageParserState => ({
  remaining: s,
  digest: Option.none(),
  tag: Option.none(),
});

/** Extract @sha256:digest if present */
const extractDigest = (state: ImageParserState): Option.Option<ImageParserState> => {
  const digestIdx = state.remaining.indexOf("@sha256:");
  return digestIdx === -1
    ? Option.some(state)
    : pipe(
        Option.some(state.remaining.slice(digestIdx + 8)),
        Option.filter((digestStr) => digestStr.length > 0 && all(isLowerHex)(digestStr)),
        Option.map((digestStr) => ({
          remaining: state.remaining.slice(0, digestIdx),
          digest: Option.some(digestStr),
          tag: state.tag,
        }))
      );
};

/** Extract :tag if present */
const extractTag = (state: ImageParserState): Option.Option<ImageParserState> => {
  const colonIdx = state.remaining.indexOf(":");
  return colonIdx === -1
    ? Option.some(state)
    : pipe(
        Option.some(state.remaining.slice(colonIdx + 1)),
        Option.filter((tagStr) => tagStr.length > 0 && all(isTagChar)(tagStr)),
        Option.map((tagStr) => ({
          remaining: state.remaining.slice(0, colonIdx),
          digest: state.digest,
          tag: Option.some(tagStr),
        }))
      );
};

/** Finalize image by validating name */
const finalizeImage = (state: ImageParserState): Option.Option<ParsedContainerImage> =>
  pipe(
    Option.some(state),
    Option.filter((s) => s.remaining.length > 0 && all(isImageNameChar)(s.remaining)),
    Option.map((s) => ({
      name: s.remaining,
      tag: s.tag,
      digest: s.digest,
    }))
  );

/**
 * Parse container image: name[:tag][@sha256:digest]
 */
export const parseContainerImage = (s: string): Option.Option<ParsedContainerImage> =>
  pipe(
    initialImageState(s),
    Option.some,
    Option.flatMap(extractDigest),
    Option.flatMap(extractTag),
    Option.flatMap(finalizeImage)
  );

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
