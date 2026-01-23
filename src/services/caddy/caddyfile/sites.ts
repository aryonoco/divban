// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Site blocks - the core of Caddyfile configuration. Each site
 * represents a domain/address with routes, handlers, and matchers.
 * Ordering matters: first matching handle block wins. Named matchers
 * (@name) enable complex routing patterns within sites.
 */

import { Array as Arr, Option, pipe } from "effect";
import { nonEmpty } from "../../../lib/option-helpers";
import type { Directive, Route, Site } from "../schema";
import { directivesOps } from "./directives";
import { Caddy, type CaddyOp, caddyfile } from "./format";
import { matchersOps } from "./matchers";

const routeOpener = (route: Route): CaddyOp =>
  pipe(
    Option.fromNullable(route.name),
    Option.match({
      onNone: (): CaddyOp =>
        pipe(
          nonEmpty(route.match),
          Option.match({
            onNone: (): CaddyOp => Caddy.open("handle"),
            onSome: (matches): CaddyOp => Caddy.open(`handle_path ${matches.join(" ")}`),
          })
        ),
      onSome: (name): CaddyOp => Caddy.open(`@${name}`),
    })
  );

export const routeOps = (route: Route): CaddyOp =>
  Caddy.seq(routeOpener(route), directivesOps(route.directives, 1), Caddy.close);

export const siteOps = (site: Site): CaddyOp => {
  const matchersOpt = nonEmpty(site.matchers);
  const routesOpt = nonEmpty(site.routes);
  const directivesOpt = nonEmpty(site.directives);

  return Caddy.seq(
    Caddy.open(site.addresses.join(", ")),

    pipe(
      matchersOpt,
      Option.match({
        onNone: (): CaddyOp => Caddy.id,
        onSome: (matchers): CaddyOp =>
          Caddy.seq(Caddy.blank, Caddy.comment("Named matchers"), matchersOps(matchers)),
      })
    ),

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

// First site handled specially to avoid leading blank line at start of output
export const sitesOps = (sites: readonly Site[]): CaddyOp =>
  pipe(
    Arr.head(sites),
    Option.match({
      onNone: (): CaddyOp => Caddy.id,
      onSome: (firstSite): CaddyOp =>
        Caddy.seq(
          siteOps(firstSite),
          ...sites.slice(1).map((site) => Caddy.seq(Caddy.blank, siteOps(site)))
        ),
    })
  );

export const generateRoute = (route: Route): string => caddyfile(routeOps(route));

export const generateSite = (site: Site): string => caddyfile(siteOps(site));

export const generateSites = (sites: readonly Site[]): string =>
  sites.map(generateSite).join("\n\n");

export const Sites: Record<string, (...args: never[]) => Site> = {
  reverseProxy: (addresses: string[], upstream: string): Site => ({
    addresses,
    directives: [{ name: "reverse_proxy", args: [upstream] }],
  }),

  fileServer: (addresses: string[], root: string, options?: { browse?: boolean }): Site => {
    const fileServerDirective: Directive = options?.browse
      ? { name: "file_server", args: ["browse"] }
      : { name: "file_server" };
    return {
      addresses,
      directives: [{ name: "root", args: ["*", root] }, fileServerDirective],
    };
  },

  redirect: (addresses: string[], target: string, permanent?: boolean): Site => ({
    addresses,
    directives: [{ name: "redir", args: permanent ? [target, "permanent"] : [target] }],
  }),

  phpFpm: (addresses: string[], root: string, phpFpmSocket: string): Site => ({
    addresses,
    directives: [
      { name: "root", args: ["*", root] },
      { name: "php_fastcgi", args: [phpFpmSocket] },
      { name: "file_server" },
    ],
  }),
};
