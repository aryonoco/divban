// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Parser-first validation: each parser returns `Option<StructuredData>`,
 * and validators derive from parsers via `Option.isSome`. This yields
 * structured parsed data on success without regex complexity.
 */

import { Effect, Either, Option, ParseResult, Predicate, Schema, pipe } from "effect";
import {
  type CharPred,
  isAlphaNum,
  isDigit,
  isHexDigit,
  isLower,
  isLowerHex,
  isOneOf,
  isWhitespace,
} from "./char";
import { ConfigError, ErrorCode } from "./errors";
import { all, last, uncons } from "./str";

export const formatSchemaError = (error: ParseResult.ParseError, context: string): ConfigError => {
  const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
  return new ConfigError({
    code: ErrorCode.CONFIG_VALIDATION_ERROR,
    message: `Configuration validation failed for ${context}:\n${formatted}`,
    path: context,
  });
};

/** Throws on invalid input — only safe for statically known-valid data. */
export const decodeUnsafe = <A, I = A>(schema: Schema.Schema<A, I, never>, data: unknown): A =>
  Schema.decodeUnknownSync(schema)(data);

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
          code: ErrorCode.CONFIG_VALIDATION_ERROR,
          message: `Configuration validation failed for ${context}:\n${formatted}`,
          path: context,
        })
      );
    },
    onRight: (value): Effect.Effect<A, ConfigError> => Effect.succeed(value),
  });
};

/** Parse a non-negative integer, rejecting leading zeros (except `"0"` itself). */
export const parseNat = (s: string): Option.Option<number> =>
  pipe(
    Option.some(s),
    Option.filter((str) => str.length > 0),
    Option.filter(all(isDigit)),
    Option.filter((str) => str.length === 1 || !str.startsWith("0")),
    Option.map((str) => Number.parseInt(str, 10)),
    Option.filter((n) => !Number.isNaN(n))
  );

export const parseOctet = (s: string): Option.Option<number> =>
  pipe(
    parseNat(s),
    Option.filter((n) => n <= 255)
  );

export type IPv4Octets = readonly [number, number, number, number];

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

export const isValidIPv4 = (s: string): boolean => Option.isSome(parseIPv4(s));

const isHexGroup = (s: string): boolean => s.length > 0 && s.length <= 4 && all(isHexDigit)(s);

type CountState = { readonly pos: number; readonly count: number };

const countStep =
  (sub: string, s: string) =>
  (state: CountState): CountState => {
    const idx = s.indexOf(sub, state.pos);
    return idx === -1
      ? state
      : countStep(sub, s)({ pos: idx + sub.length, count: state.count + 1 });
  };

const countSubstring =
  (sub: string) =>
  (s: string): number =>
    sub.length === 0 ? 0 : countStep(sub, s)({ pos: 0, count: 0 }).count;

interface IPv6ParseState {
  readonly groups: readonly string[];
  readonly hasDoubleColon: boolean;
}

const buildIPv6State = (s: string): IPv6ParseState => ({
  groups: s.split("::").flatMap((g) => (g === "" ? [] : g.split(":"))),
  hasDoubleColon: s.includes("::"),
});

const maxGroupsFor = (state: IPv6ParseState): number => (state.hasDoubleColon ? 7 : 8);

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

export interface ParsedEmail {
  readonly local: string;
  readonly domain: string;
}

const isEmailChar = (c: string): boolean => !isWhitespace(c) && c !== "@";

interface EmailParseState {
  readonly local: string;
  readonly domain: string;
}

const buildEmailState = (s: string): EmailParseState => {
  const atIdx = s.indexOf("@");
  return {
    local: s.slice(0, Math.max(0, atIdx)),
    domain: s.slice(atIdx + 1),
  };
};

const hasDotInMiddle = (domain: string): boolean => {
  const dotIdx = domain.indexOf(".");
  return dotIdx > 0 && dotIdx < domain.length - 1;
};

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

const isPosixFirst: CharPred = Predicate.some([isLower, isOneOf("_")]);

const isPosixRest: CharPred = Predicate.some([isLower, isDigit, isOneOf("_-")]);

export const parsePosixUsername = (s: string): Option.Option<string> =>
  pipe(
    uncons(s),
    Option.filter((tuple) => isPosixFirst(tuple[0])),
    Option.filter((tuple) => all(isPosixRest)(tuple[1])),
    Option.map(() => s)
  );

export const isValidPosixUsername = (s: string): boolean => Option.isSome(parsePosixUsername(s));

const isServiceFirst = isLower;

const isServiceRest: CharPred = Predicate.some([isLower, isDigit, isOneOf("-")]);

export const parseServiceName = (s: string): Option.Option<string> =>
  pipe(
    uncons(s),
    Option.filter((tuple) => isServiceFirst(tuple[0])),
    Option.filter((tuple) => all(isServiceRest)(tuple[1])),
    Option.map(() => s)
  );

export const isValidServiceName = (s: string): boolean => Option.isSome(parseServiceName(s));

const isContainerFirst = isAlphaNum;

const isContainerOrTagChar: CharPred = Predicate.some([isAlphaNum, isOneOf("_.-")]);

export const parseContainerName = (s: string): Option.Option<string> =>
  pipe(
    uncons(s),
    Option.filter((tuple) => isContainerFirst(tuple[0])),
    Option.filter((tuple) => all(isContainerOrTagChar)(tuple[1])),
    Option.map(() => s)
  );

export const isValidContainerName = (s: string): boolean => Option.isSome(parseContainerName(s));

export interface ParsedContainerImage {
  readonly name: string;
  readonly tag: Option.Option<string>;
  readonly digest: Option.Option<string>;
}

const isImageNameChar: CharPred = Predicate.some([isAlphaNum, isOneOf("_./-")]);

interface ImageParserState {
  readonly remaining: string;
  readonly digest: Option.Option<string>;
  readonly tag: Option.Option<string>;
}

const initialImageState = (s: string): ImageParserState => ({
  remaining: s,
  digest: Option.none(),
  tag: Option.none(),
});

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

const extractTag = (state: ImageParserState): Option.Option<ImageParserState> => {
  const colonIdx = state.remaining.indexOf(":");
  return colonIdx === -1
    ? Option.some(state)
    : pipe(
        Option.some(state.remaining.slice(colonIdx + 1)),
        Option.filter((tagStr) => tagStr.length > 0 && all(isContainerOrTagChar)(tagStr)),
        Option.map((tagStr) => ({
          remaining: state.remaining.slice(0, colonIdx),
          digest: state.digest,
          tag: Option.some(tagStr),
        }))
      );
};

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

export const parseContainerImage = (s: string): Option.Option<ParsedContainerImage> =>
  pipe(
    initialImageState(s),
    Option.some,
    Option.flatMap(extractDigest),
    Option.flatMap(extractTag),
    Option.flatMap(finalizeImage)
  );

export const isValidContainerImage = (s: string): boolean => Option.isSome(parseContainerImage(s));

export const isValidUrl = (s: string): boolean => {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
};

const DURATION_UNITS = ["ms", "s", "m", "h", "d"] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];

export interface ParsedDuration {
  readonly value: number;
  readonly unit: DurationUnit;
}

/** Must check `"ms"` before single-char units to avoid matching `"s"` alone. */
const extractDurationUnit = (
  s: string
): Option.Option<{ unit: DurationUnit; numericPart: string }> =>
  s.endsWith("ms")
    ? Option.some({ unit: "ms" as const, numericPart: s.slice(0, -2) })
    : pipe(
        last(s),
        Option.filter(
          (c): c is "s" | "m" | "h" | "d" => c === "s" || c === "m" || c === "h" || c === "d"
        ),
        Option.map((unit) => ({ unit, numericPart: s.slice(0, -1) }))
      );

/** Accepts `"10s"`, `"5m"`, `"1h"`, `"30ms"`, `"2d"`. */
export const parseDurationString = (s: string): Option.Option<ParsedDuration> =>
  pipe(
    Option.some(s),
    Option.filter((str) => str.length >= 2), // Minimum: "0s"
    Option.flatMap(extractDurationUnit),
    Option.filter(({ numericPart }) => numericPart.length > 0),
    Option.flatMap(({ unit, numericPart }) =>
      pipe(
        parseNat(numericPart),
        Option.map((value) => ({ value, unit }))
      )
    )
  );

export const isValidDurationString = (s: string): boolean => Option.isSome(parseDurationString(s));
