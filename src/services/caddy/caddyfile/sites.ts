// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Site block generation for Caddyfile.
 */

import { nonEmpty } from "../../../lib/option";
import type { Directive, Route, Site } from "../schema";
import { renderDirectives } from "./directives";
import { createBuilder } from "./format";
import { generateNamedMatchers } from "./matchers";

/**
 * Generate a route block.
 */
export const generateRoute = (route: Route): string => {
  const builder = createBuilder();

  // Route can be:
  // - Named route: @name { ... }
  // - Matched route: route /path { ... } or handle /path { ... }
  // - Anonymous route: route { ... }

  const matchOpt = nonEmpty(route.match);
  if (route.name) {
    // Named route
    builder.open(`@${route.name}`);
  } else if (matchOpt.isSome) {
    // Matched route (using handle_path for path-based matching)
    const matchStr = matchOpt.value.join(" ");
    builder.open(`handle_path ${matchStr}`);
  } else {
    // Anonymous route using handle
    builder.open("handle");
  }

  const directivesContent = renderDirectives(route.directives, 1);
  if (directivesContent) {
    builder.raw(directivesContent.trim());
  }

  builder.close();

  return builder.build();
};

/**
 * Generate a site block.
 */
export const generateSite = (site: Site): string => {
  const builder = createBuilder();

  // Site addresses
  const addresses = site.addresses.join(", ");
  builder.open(addresses);

  // Named matchers (if any)
  const matchersOpt = nonEmpty(site.matchers);
  if (matchersOpt.isSome) {
    const matchersContent = generateNamedMatchers(matchersOpt.value);
    builder.blank();
    builder.comment("Named matchers");
    builder.raw(matchersContent.trim());
  }

  // Routes (if any)
  const routesOpt = nonEmpty(site.routes);
  if (routesOpt.isSome) {
    builder.blank();
    builder.comment("Routes");
    for (const route of routesOpt.value) {
      builder.raw(generateRoute(route).trim());
      builder.blank();
    }
  }

  // Direct directives (if any)
  const directivesOpt = nonEmpty(site.directives);
  if (directivesOpt.isSome) {
    builder.blank();
    const directivesContent = renderDirectives(directivesOpt.value, 1);
    builder.raw(directivesContent.trim());
  }

  builder.close();

  return builder.build();
};

/**
 * Generate all sites.
 */
export const generateSites = (sites: Site[]): string => {
  return sites.map(generateSite).join("\n\n");
};

/**
 * Common site builders.
 */
export const Sites: Record<string, (...args: never[]) => Site> = {
  /**
   * Simple reverse proxy site
   */
  reverseProxy: (addresses: string[], upstream: string): Site => ({
    addresses,
    directives: [{ name: "reverse_proxy", args: [upstream] }],
  }),

  /**
   * Static file server site
   */
  fileServer: (addresses: string[], root: string, options?: { browse?: boolean }): Site => {
    const fileServerDirective: Directive = { name: "file_server" };
    if (options?.browse) {
      fileServerDirective.args = ["browse"];
    }
    return {
      addresses,
      directives: [{ name: "root", args: ["*", root] }, fileServerDirective],
    };
  },

  /**
   * Redirect site
   */
  redirect: (addresses: string[], target: string, permanent?: boolean): Site => ({
    addresses,
    directives: [{ name: "redir", args: permanent ? [target, "permanent"] : [target] }],
  }),

  /**
   * PHP-FPM site
   */
  phpFpm: (addresses: string[], root: string, phpFpmSocket: string): Site => ({
    addresses,
    directives: [
      { name: "root", args: ["*", root] },
      { name: "php_fastcgi", args: [phpFpmSocket] },
      { name: "file_server" },
    ],
  }),
};
