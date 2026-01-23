// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Global options block - Caddyfile's top-level configuration. These
 * settings affect all sites: admin API endpoint, ACME email for TLS
 * certificates, default SNI for HTTPS. Must appear before any site
 * blocks in the generated output.
 */

import { Match, Option, pipe } from "effect";
import { flatMapEntries } from "../../../lib/collection-utils";
import type { GlobalOptions } from "../schema";
import { Caddy, type CaddyOp, caddyfile } from "./format";

/**
 * Server configuration for Caddyfile global options.
 * Defined locally as it's not exported from schema.
 */
interface ServerConfig {
  readonly listen?: readonly string[] | undefined;
  readonly protocols?: readonly string[] | undefined;
  readonly strictSniHost?: boolean | undefined;
}

const serverConfigOps = (name: string, config: ServerConfig): readonly CaddyOp[] =>
  name === "*" || name === "default"
    ? [
        Caddy.when(config.protocols !== undefined, Caddy.directive("protocols", config.protocols)),
        Caddy.when(config.strictSniHost === true, Caddy.directive("strict_sni_host")),
      ]
    : [
        Caddy.open(name),
        Caddy.when(config.listen !== undefined, Caddy.directive("listen", config.listen)),
        Caddy.when(config.protocols !== undefined, Caddy.directive("protocols", config.protocols)),
        Caddy.when(config.strictSniHost === true, Caddy.directive("strict_sni_host")),
        Caddy.close,
      ];

const serversBlockOps = (servers: Record<string, ServerConfig> | undefined): CaddyOp =>
  servers === undefined || Object.keys(servers).length === 0
    ? Caddy.id
    : Caddy.seq(
        Caddy.open("servers"),
        Caddy.all(flatMapEntries(servers, serverConfigOps)),
        Caddy.close
      );

const logBlockOps = (options: GlobalOptions): CaddyOp =>
  options.logFormat === undefined && options.logLevel === undefined
    ? Caddy.id
    : Caddy.seq(
        Caddy.open("log"),
        Caddy.maybeDirective("format", options.logFormat),
        Caddy.maybeDirective("level", options.logLevel),
        Caddy.close
      );

const adminBlockOps = (options: GlobalOptions): CaddyOp =>
  pipe(
    Match.value(options),
    Match.when({ adminOff: true }, (): CaddyOp => Caddy.directive("admin", ["off"])),
    Match.when(
      { adminEnforceOrigin: true },
      (): CaddyOp => Caddy.seq(Caddy.open("admin"), Caddy.directive("enforce_origin"), Caddy.close)
    ),
    Match.orElse((): CaddyOp => Caddy.id)
  );

export const globalOps = (options: GlobalOptions): CaddyOp =>
  Caddy.seq(
    Caddy.open(""),
    Caddy.when(options.debug === true, Caddy.directive("debug")),
    Caddy.maybeDirective("email", options.email),
    Caddy.maybeDirective("acme_ca", options.acmeCA),
    Caddy.maybeDirective("acme_ca_root", options.acmeCaRoot),
    Caddy.when(options.localCerts === true, Caddy.directive("local_certs")),
    Caddy.when(options.skipInstallTrust === true, Caddy.directive("skip_install_trust")),
    adminBlockOps(options),
    Caddy.maybeDirectiveNum("http_port", options.httpPort),
    Caddy.maybeDirectiveNum("https_port", options.httpsPort),
    Caddy.maybeDirective("auto_https", options.autoHttps),
    serversBlockOps(options.servers),
    logBlockOps(options),
    Caddy.close
  );

export const generateGlobalOptions = (options: GlobalOptions): string =>
  caddyfile(globalOps(options));

export const hasGlobalOptions = (options: GlobalOptions | undefined): boolean =>
  pipe(
    Match.value(options),
    Match.when(undefined, () => false),
    Match.orElse((opts) => {
      const defined = <T>(v: T | undefined): boolean =>
        Option.match(Option.fromNullable(v), {
          onNone: (): boolean => false,
          onSome: (): boolean => true,
        });

      return (
        defined(opts.debug) ||
        defined(opts.email) ||
        defined(opts.acmeCA) ||
        defined(opts.acmeCaRoot) ||
        defined(opts.localCerts) ||
        defined(opts.skipInstallTrust) ||
        defined(opts.adminOff) ||
        defined(opts.adminEnforceOrigin) ||
        defined(opts.httpPort) ||
        defined(opts.httpsPort) ||
        defined(opts.autoHttps) ||
        defined(opts.servers) ||
        defined(opts.logFormat) ||
        defined(opts.logLevel)
      );
    })
  );
