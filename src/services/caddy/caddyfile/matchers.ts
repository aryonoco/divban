// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Named matcher generation for Caddyfile.
 */

import { fromUndefined, isSome, nonEmpty } from "../../../lib/option";
import type { NamedMatcher } from "../schema";
import { createBuilder, escapeValue } from "./format";

/**
 * Generate a named matcher definition.
 */
export const generateNamedMatcher = (matcher: NamedMatcher): string => {
  const builder = createBuilder();

  builder.open(`@${matcher.name}`);

  // Path matching
  const pathOpt = nonEmpty(matcher.path);
  if (pathOpt.isSome) {
    builder.directive("path", pathOpt.value);
  }

  // Path regexp
  if (matcher.pathRegexp) {
    builder.directive("path_regexp", [matcher.pathRegexp]);
  }

  // Host matching
  const hostOpt = nonEmpty(matcher.host);
  if (hostOpt.isSome) {
    builder.directive("host", hostOpt.value);
  }

  // Method matching
  const methodOpt = nonEmpty(matcher.method);
  if (methodOpt.isSome) {
    builder.directive("method", methodOpt.value);
  }

  // Header matching
  if (matcher.header) {
    for (const [name, value] of Object.entries(matcher.header)) {
      builder.directive("header", [name, value as string]);
    }
  }

  // Header regexp
  if (matcher.headerRegexp) {
    for (const [name, pattern] of Object.entries(matcher.headerRegexp)) {
      builder.directive("header_regexp", [name, pattern as string]);
    }
  }

  // Query matching
  if (matcher.query) {
    for (const [key, value] of Object.entries(matcher.query)) {
      builder.directive("query", [`${key}=${escapeValue(value as string)}`]);
    }
  }

  // Remote IP matching
  const remoteIpOpt = nonEmpty(matcher.remoteIp);
  if (remoteIpOpt.isSome) {
    builder.directive("remote_ip", remoteIpOpt.value);
  }

  // Protocol matching
  if (matcher.protocol) {
    builder.directive("protocol", [matcher.protocol]);
  }

  // Expression
  if (matcher.expression) {
    builder.directive("expression", [escapeValue(matcher.expression)]);
  }

  // Not (negation)
  if (matcher.not) {
    builder.open("not");
    // Recursively render the negated conditions
    if (matcher.not.path) {
      builder.directive("path", matcher.not.path);
    }
    if (matcher.not.host) {
      builder.directive("host", matcher.not.host);
    }
    if (matcher.not.method) {
      builder.directive("method", matcher.not.method);
    }
    // ... add other not conditions as needed
    builder.close();
  }

  builder.close();

  return builder.build();
};

/**
 * Generate all named matchers.
 */
export const generateNamedMatchers = (matchers: NamedMatcher[]): string => {
  if (matchers.length === 0) {
    return "";
  }

  return matchers.map(generateNamedMatcher).join("\n");
};

/**
 * Generate a matcher reference for use in directives.
 */
export const matcherRef = (name: string): string => {
  return `@${name}`;
};

/**
 * Check if a matcher is empty (has no conditions).
 */
export const isEmptyMatcher = (matcher: Omit<NamedMatcher, "name">): boolean => {
  const defined = <T>(v: T | undefined): boolean => isSome(fromUndefined(v));

  return !(
    nonEmpty(matcher.path).isSome ||
    defined(matcher.pathRegexp) ||
    nonEmpty(matcher.host).isSome ||
    nonEmpty(matcher.method).isSome ||
    defined(matcher.header) ||
    defined(matcher.headerRegexp) ||
    defined(matcher.query) ||
    nonEmpty(matcher.remoteIp).isSome ||
    defined(matcher.protocol) ||
    defined(matcher.not) ||
    defined(matcher.expression)
  );
};
