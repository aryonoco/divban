// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Snippet generation for Caddyfile.
 */

import { Option, pipe } from "effect";
import { nonEmpty } from "../../../lib/option-helpers";
import type { Snippet } from "../schema";
import { directivesOps } from "./directives";
import { Caddy, type CaddyOp, caddyfile } from "./format";

// ============================================================================
// CaddyOp Functions
// ============================================================================

/**
 * Format snippet name with optional args.
 */
const snippetName = (snippet: Snippet): string =>
  pipe(
    nonEmpty(snippet.args),
    Option.match({
      onNone: (): string => `(${snippet.name})`,
      onSome: (args): string => `(${snippet.name} ${args.join(" ")})`,
    })
  );

/**
 * Generate operations for a single snippet.
 */
export const snippetOps = (snippet: Snippet): CaddyOp =>
  Caddy.seq(Caddy.open(snippetName(snippet)), directivesOps(snippet.directives, 1), Caddy.close);

/**
 * Generate operations for multiple snippets.
 * Uses forEach for iteration.
 */
export const snippetsOps = (snippets: readonly Snippet[]): CaddyOp =>
  snippets.length === 0 ? Caddy.id : Caddy.forEach(snippets, snippetOps);

// ============================================================================
// String-returning functions
// ============================================================================

/**
 * Generate a snippet definition as string.
 */
export const generateSnippet = (snippet: Snippet): string => caddyfile(snippetOps(snippet));

/**
 * Generate all snippets as string.
 */
export const generateSnippets = (snippets: readonly Snippet[]): string =>
  snippets.length === 0 ? "" : snippets.map(generateSnippet).join("\n");

/**
 * Generate an import directive string.
 * Pure function - returns string for use in directives.
 */
export const importSnippet = (name: string, args?: readonly string[]): string =>
  pipe(
    nonEmpty(args),
    Option.match({
      onNone: (): string => `import ${name}`,
      onSome: (a): string => `import ${name} ${a.join(" ")}`,
    })
  );
