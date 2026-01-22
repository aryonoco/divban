// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Site block generation for Caddyfile.
 */

import { Array as Arr, Option, pipe } from "effect";
import { nonEmpty } from "../../../lib/option-helpers";
import type { Directive, Route, Site } from "../schema";
import { directivesOps } from "./directives";
import { Caddy, type CaddyOp, caddyfile } from "./format";
import { matchersOps } from "./matchers";

// ============================================================================
// CaddyOp Functions
// ============================================================================

/**
 * Determine the route opener based on route config.
 */
const routeOpener = (route: Route): CaddyOp => {
  if (route.name !== undefined) {
    return Caddy.open(`@${route.name}`);
  }

  return pipe(
    nonEmpty(route.match),
    Option.match({
      onNone: (): CaddyOp => Caddy.open("handle"),
      onSome: (matches): CaddyOp => Caddy.open(`handle_path ${matches.join(" ")}`),
    })
  );
};

/**
 * Generate operations for a single route.
 */
export const routeOps = (route: Route): CaddyOp =>
  Caddy.seq(routeOpener(route), directivesOps(route.directives, 1), Caddy.close);

/**
 * Generate operations for a single site.
 */
export const siteOps = (site: Site): CaddyOp => {
  const matchersOpt = nonEmpty(site.matchers);
  const routesOpt = nonEmpty(site.routes);
  const directivesOpt = nonEmpty(site.directives);

  return Caddy.seq(
    // Site address(es)
    Caddy.open(site.addresses.join(", ")),

    // Named matchers (if any)
    pipe(
      matchersOpt,
      Option.match({
        onNone: (): CaddyOp => Caddy.id,
        onSome: (matchers): CaddyOp =>
          Caddy.seq(Caddy.blank, Caddy.comment("Named matchers"), matchersOps(matchers)),
      })
    ),

    // Routes (if any)
    pipe(
      routesOpt,
      Option.match({
        onNone: (): CaddyOp => Caddy.id,
        onSome: (routes): CaddyOp =>
          Caddy.seq(
            Caddy.blank,
            Caddy.comment("Routes"),
            Caddy.forEach(routes, (route): CaddyOp => Caddy.seq(routeOps(route), Caddy.blank))
          ),
      })
    ),

    // Direct directives (if any)
    pipe(
      directivesOpt,
      Option.match({
        onNone: (): CaddyOp => Caddy.id,
        onSome: (directives): CaddyOp => Caddy.seq(Caddy.blank, directivesOps(directives, 1)),
      })
    ),

    Caddy.close
  );
};

/**
 * Generate operations for multiple sites.
 * Intersperse with blank lines.
 */
export const sitesOps = (sites: readonly Site[]): CaddyOp =>
  pipe(
    Arr.head(sites),
    Option.match({
      onNone: (): CaddyOp => Caddy.id,
      onSome: (firstSite): CaddyOp =>
        // First site without leading blank, remaining sites with leading blank
        Caddy.seq(
          siteOps(firstSite),
          ...sites.slice(1).map((site) => Caddy.seq(Caddy.blank, siteOps(site)))
        ),
    })
  );

// ============================================================================
// String-returning functions (backward compatibility)
// ============================================================================

/**
 * Generate a route block as string.
 */
export const generateRoute = (route: Route): string => caddyfile(routeOps(route));

/**
 * Generate a site block as string.
 */
export const generateSite = (site: Site): string => caddyfile(siteOps(site));

/**
 * Generate all sites as string.
 */
export const generateSites = (sites: readonly Site[]): string =>
  sites.map(generateSite).join("\n\n");

// ============================================================================
// Site Factory Helpers
// ============================================================================

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
    const fileServerDirective: Directive = options?.browse
      ? { name: "file_server", args: ["browse"] }
      : { name: "file_server" };
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
