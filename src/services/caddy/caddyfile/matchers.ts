// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Named matchers for reusable request conditions. Define once as
 * @name { ... }, reference anywhere with @name. Supports path patterns,
 * headers, query params, and boolean logic (not/or). Essential for
 * complex routing without duplicating conditions across handlers.
 */

import { Option, pipe } from "effect";
import { mapEntries } from "../../../lib/collection-utils";
import { nonEmpty } from "../../../lib/option-helpers";
import type { NamedMatcher } from "../schema";
import { Caddy, type CaddyOp, caddyfile, escapeValue } from "./format";

// ============================================================================
// Record → CaddyOp[] Transformers
// ============================================================================

/**
 * Transform header record to operations.
 * Uses mapEntries instead of for loop over Object.entries.
 */
const headerOps = (header: Record<string, string> | undefined): readonly CaddyOp[] =>
  header === undefined
    ? []
    : mapEntries(header, (name, value) => Caddy.directive("header", [name, value]));

/**
 * Transform header regexp record to operations.
 */
const headerRegexpOps = (headerRegexp: Record<string, string> | undefined): readonly CaddyOp[] =>
  headerRegexp === undefined
    ? []
    : mapEntries(headerRegexp, (name, pattern) =>
        Caddy.directive("header_regexp", [name, pattern])
      );

/**
 * Transform query record to operations.
 */
const queryOps = (query: Record<string, string> | undefined): readonly CaddyOp[] =>
  query === undefined
    ? []
    : mapEntries(query, (key, value) => Caddy.directive("query", [`${key}=${escapeValue(value)}`]));

/**
 * Negation block operations.
 * Returns id (no-op) if not is undefined.
 */
const notBlockOps = (not: NamedMatcher["not"]): CaddyOp =>
  not === undefined
    ? Caddy.id
    : Caddy.seq(
        Caddy.open("not"),
        Caddy.when(not.path !== undefined, Caddy.directive("path", not.path ?? [])),
        Caddy.when(not.host !== undefined, Caddy.directive("host", not.host ?? [])),
        Caddy.when(not.method !== undefined, Caddy.directive("method", not.method ?? [])),
        Caddy.close
      );

/**
 * Conditional directive for array-valued options.
 */
const maybeArrayDirective = (name: string, opt: Option.Option<readonly string[]>): CaddyOp =>
  pipe(
    opt,
    Option.match({
      onNone: (): CaddyOp => Caddy.id,
      onSome: (arr): CaddyOp => Caddy.directive(name, arr),
    })
  );

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate operations for a single named matcher.
 * Returns CaddyOp for composition with other operations.
 */
export const matcherOps = (matcher: NamedMatcher): CaddyOp => {
  const pathOpt = nonEmpty(matcher.path);
  const hostOpt = nonEmpty(matcher.host);
  const methodOpt = nonEmpty(matcher.method);
  const remoteIpOpt = nonEmpty(matcher.remoteIp);

  return Caddy.seq(
    Caddy.open(`@${matcher.name}`),

    // Array-valued directives (use Option pattern)
    maybeArrayDirective("path", pathOpt),
    Caddy.maybeDirective("path_regexp", matcher.pathRegexp),
    maybeArrayDirective("host", hostOpt),
    maybeArrayDirective("method", methodOpt),

    // Record-valued directives (use mapEntries)
    Caddy.all(headerOps(matcher.header)),
    Caddy.all(headerRegexpOps(matcher.headerRegexp)),
    Caddy.all(queryOps(matcher.query)),

    // More array/simple directives
    maybeArrayDirective("remote_ip", remoteIpOpt),
    Caddy.maybeDirective("protocol", matcher.protocol),
    Caddy.when(
      matcher.expression !== undefined,
      Caddy.directive("expression", [escapeValue(matcher.expression ?? "")])
    ),

    // Negation block
    notBlockOps(matcher.not),

    Caddy.close
  );
};

/**
 * Generate operations for multiple matchers.
 */
export const matchersOps = (matchers: readonly NamedMatcher[]): CaddyOp =>
  matchers.length === 0 ? Caddy.id : Caddy.forEach(matchers, matcherOps);

// ============================================================================
// String-returning functions
// ============================================================================

/**
 * Generate a named matcher definition as string.
 * Wrapper around matcherOps for backward compatibility.
 */
export const generateNamedMatcher = (matcher: NamedMatcher): string =>
  caddyfile(matcherOps(matcher));

/**
 * Generate all named matchers as string.
 */
export const generateNamedMatchers = (matchers: readonly NamedMatcher[]): string =>
  matchers.length === 0 ? "" : matchers.map(generateNamedMatcher).join("\n");

// ============================================================================
// Utilities
// ============================================================================

/** Generate a matcher reference for use in directives. */
export const matcherRef = (name: string): string => `@${name}`;

/**
 * Check if a matcher is empty (has no conditions).
 * Uses Option for null-safe checking.
 */
export const isEmptyMatcher = (matcher: Omit<NamedMatcher, "name">): boolean => {
  const defined = <T>(v: T | undefined): boolean =>
    Option.match(Option.fromNullable(v), {
      onNone: (): boolean => false,
      onSome: (): boolean => true,
    });

  const hasValue = <T>(opt: Option.Option<readonly T[]>): boolean =>
    Option.match(opt, { onNone: (): boolean => false, onSome: (): boolean => true });

  // A matcher is empty if ALL conditions are undefined/empty
  return !(
    hasValue(nonEmpty(matcher.path)) ||
    defined(matcher.pathRegexp) ||
    hasValue(nonEmpty(matcher.host)) ||
    hasValue(nonEmpty(matcher.method)) ||
    defined(matcher.header) ||
    defined(matcher.headerRegexp) ||
    defined(matcher.query) ||
    hasValue(nonEmpty(matcher.remoteIp)) ||
    defined(matcher.protocol) ||
    defined(matcher.not) ||
    defined(matcher.expression)
  );
};
