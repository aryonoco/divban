/**
 * Snippet generation for Caddyfile.
 */

import type { Snippet } from "../schema";
import { renderDirectives } from "./directives";
import { createBuilder } from "./format";

/**
 * Generate a snippet definition.
 */
export const generateSnippet = (snippet: Snippet): string => {
  const builder = createBuilder();

  // Snippet name with optional args
  const name =
    snippet.args && snippet.args.length > 0
      ? `(${snippet.name} ${snippet.args.join(" ")})`
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
export const generateSnippets = (snippets: Snippet[]): string => {
  if (snippets.length === 0) {
    return "";
  }

  return snippets.map(generateSnippet).join("\n");
};

/**
 * Generate a snippet import directive.
 */
export const importSnippet = (name: string, args?: string[]): string => {
  if (args && args.length > 0) {
    return `import ${name} ${args.join(" ")}`;
  }
  return `import ${name}`;
};
