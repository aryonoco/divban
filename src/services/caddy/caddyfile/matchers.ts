// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Named matcher generation for Caddyfile.
 */

import type { NamedMatcher } from "../schema";
import { createBuilder, escapeValue } from "./format";

/**
 * Generate a named matcher definition.
 */
export const generateNamedMatcher = (matcher: NamedMatcher): string => {
  const builder = createBuilder();

  builder.open(`@${matcher.name}`);

  // Path matching
  if (matcher.path && matcher.path.length > 0) {
    builder.directive("path", matcher.path);
  }

  // Path regexp
  if (matcher.pathRegexp) {
    builder.directive("path_regexp", [matcher.pathRegexp]);
  }

  // Host matching
  if (matcher.host && matcher.host.length > 0) {
    builder.directive("host", matcher.host);
  }

  // Method matching
  if (matcher.method && matcher.method.length > 0) {
    builder.directive("method", matcher.method);
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
  if (matcher.remoteIp && matcher.remoteIp.length > 0) {
    builder.directive("remote_ip", matcher.remoteIp);
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
  return !(
    (matcher.path && matcher.path.length > 0) ||
    matcher.pathRegexp ||
    (matcher.host && matcher.host.length > 0) ||
    (matcher.method && matcher.method.length > 0) ||
    matcher.header ||
    matcher.headerRegexp ||
    matcher.query ||
    (matcher.remoteIp && matcher.remoteIp.length > 0) ||
    matcher.protocol ||
    matcher.not ||
    matcher.expression
  );
};
