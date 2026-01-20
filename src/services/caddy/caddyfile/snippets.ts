// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Snippet generation for Caddyfile.
 */

import { Option } from "effect";
import { nonEmpty } from "../../../lib/option-helpers";
import type { Snippet } from "../schema";
import { renderDirectives } from "./directives";
import { createBuilder } from "./format";

/**
 * Generate a snippet definition.
 */
export const generateSnippet = (snippet: Snippet): string => {
  const builder = createBuilder();

  // Snippet name with optional args
  const argsOpt = nonEmpty(snippet.args);
  const name = Option.isSome(argsOpt)
    ? `(${snippet.name} ${argsOpt.value.join(" ")})`
    : `(${snippet.name})`;

  builder.open(name);

  // Render directives
  const directivesContent = renderDirectives(snippet.directives, 1);
  if (directivesContent) {
    builder.raw(directivesContent.trim());
  }

  builder.close();

  return builder.build();
};

/**
 * Generate all snippets.
 */
export const generateSnippets = (snippets: readonly Snippet[]): string => {
  if (snippets.length === 0) {
    return "";
  }

  return snippets.map(generateSnippet).join("\n");
};

/**
 * Generate a snippet import directive.
 */
export const importSnippet = (name: string, args?: readonly string[]): string => {
  const argsOpt = nonEmpty(args);
  if (Option.isSome(argsOpt)) {
    return `import ${name} ${argsOpt.value.join(" ")}`;
  }
  return `import ${name}`;
};
