/**
 * Site block generation for Caddyfile.
 */

import type { Route, Site } from "../schema";
import { createBuilder } from "./format";
import { renderDirectives } from "./directives";
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

  if (route.name) {
    // Named route
    builder.open(`@${route.name}`);
  } else if (route.match && route.match.length > 0) {
    // Matched route (using handle_path for path-based matching)
    const matchStr = route.match.join(" ");
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
  if (site.matchers && site.matchers.length > 0) {
    const matchersContent = generateNamedMatchers(site.matchers);
    builder.blank();
    builder.comment("Named matchers");
    builder.raw(matchersContent.trim());
  }

  // Routes (if any)
  if (site.routes && site.routes.length > 0) {
    builder.blank();
    builder.comment("Routes");
    for (const route of site.routes) {
      builder.raw(generateRoute(route).trim());
      builder.blank();
    }
  }

  // Direct directives (if any)
  if (site.directives && site.directives.length > 0) {
    builder.blank();
    const directivesContent = renderDirectives(site.directives, 1);
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
export const Sites = {
  /**
   * Simple reverse proxy site
   */
  reverseProxy: (addresses: string[], upstream: string): Site => ({
    addresses,
    directives: [
      { name: "reverse_proxy", args: [upstream] },
    ],
  }),

  /**
   * Static file server site
   */
  fileServer: (addresses: string[], root: string, options?: { browse?: boolean }): Site => ({
    addresses,
    directives: [
      { name: "root", args: ["*", root] },
      { name: "file_server", args: options?.browse ? ["browse"] : undefined },
    ],
  }),

  /**
   * Redirect site
   */
  redirect: (addresses: string[], target: string, permanent?: boolean): Site => ({
    addresses,
    directives: [
      { name: "redir", args: permanent ? [target, "permanent"] : [target] },
    ],
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
