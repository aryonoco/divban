// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddy service configuration schema.
 */

import { Schema } from "effect";
import {
  type HealthCheckConfig,
  type HealthCheckConfigInput,
  type PortConfig,
  type PortConfigInput,
  type ServiceRestartPolicy,
  type VolumeMountConfig,
  absolutePathSchema,
  portSchema,
} from "../../config/schema";
import { isValidEmail, isValidUrl } from "../../lib/schema-utils";

// The interface must explicitly include undefined for exactOptionalPropertyTypes
// Use readonly arrays to match Effect Schema's default behavior
export interface Directive {
  readonly name: string;
  readonly args?: readonly string[] | undefined;
  readonly block?: readonly Directive[] | undefined;
}

/**
 * Directive schema - recursive for nested directives.
 */
export const directiveSchema: Schema.Schema<Directive> = Schema.Struct({
  name: Schema.String,
  args: Schema.optional(Schema.Array(Schema.String)),
  block: Schema.optional(
    Schema.suspend((): Schema.Schema<readonly Directive[]> => Schema.Array(directiveSchema))
  ),
}) as unknown as Schema.Schema<Directive>;

/**
 * Named matcher interface for exactOptionalPropertyTypes compatibility.
 * Use readonly to match Effect Schema's default behavior.
 */
export interface NamedMatcher {
  readonly name: string;
  readonly path?: readonly string[] | undefined;
  readonly pathRegexp?: string | undefined;
  readonly host?: readonly string[] | undefined;
  readonly method?: readonly string[] | undefined;
  readonly header?: Readonly<Record<string, string>> | undefined;
  readonly headerRegexp?: Readonly<Record<string, string>> | undefined;
  readonly query?: Readonly<Record<string, string>> | undefined;
  readonly remoteIp?: readonly string[] | undefined;
  readonly protocol?: string | undefined;
  readonly not?: Omit<NamedMatcher, "name"> | undefined;
  readonly expression?: string | undefined;
}

// Extract matcher fields for reuse in 'not' (without name)
const matcherFieldsWithoutName = {
  path: Schema.optional(Schema.Array(Schema.String)),
  pathRegexp: Schema.optional(Schema.String),
  host: Schema.optional(Schema.Array(Schema.String)),
  method: Schema.optional(Schema.Array(Schema.String)),
  header: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  headerRegexp: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  query: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  remoteIp: Schema.optional(Schema.Array(Schema.String)),
  protocol: Schema.optional(Schema.String),
  expression: Schema.optional(Schema.String),
};

/**
 * Named matcher schema.
 */
export const namedMatcherSchema: Schema.Schema<NamedMatcher> = Schema.Struct({
  name: Schema.String,
  ...matcherFieldsWithoutName,
  not: Schema.optional(Schema.Struct(matcherFieldsWithoutName)),
}) as unknown as Schema.Schema<NamedMatcher>;

/**
 * Snippet schema.
 */
/** Caddyfile snippet */
export interface Snippet {
  readonly name: string;
  readonly args?: readonly string[] | undefined;
  readonly directives: readonly Directive[];
}

export const snippetSchema: Schema.Schema<Snippet> = Schema.Struct({
  name: Schema.String,
  args: Schema.optional(Schema.Array(Schema.String)),
  directives: Schema.Array(directiveSchema),
});

/**
 * Caddyfile route.
 */
export interface Route {
  readonly name?: string | undefined;
  readonly match?: readonly string[] | undefined;
  readonly directives: readonly Directive[];
}

export const routeSchema: Schema.Schema<Route> = Schema.Struct({
  name: Schema.optional(Schema.String),
  match: Schema.optional(Schema.Array(Schema.String)),
  directives: Schema.Array(directiveSchema),
});

/**
 * Caddyfile site.
 */
export interface Site {
  readonly addresses: readonly string[];
  readonly matchers?: readonly NamedMatcher[] | undefined;
  readonly routes?: readonly Route[] | undefined;
  readonly directives?: readonly Directive[] | undefined;
}

export const siteSchema: Schema.Schema<Site> = Schema.Struct({
  addresses: Schema.Array(Schema.String),
  matchers: Schema.optional(Schema.Array(namedMatcherSchema)),
  routes: Schema.optional(Schema.Array(routeSchema)),
  directives: Schema.optional(Schema.Array(directiveSchema)),
});

/**
 * Caddy global options.
 */
export interface GlobalOptions {
  readonly debug?: boolean | undefined;
  readonly email?: string | undefined;
  readonly acmeCA?: string | undefined;
  readonly acmeCaRoot?: string | undefined;
  readonly localCerts?: boolean | undefined;
  readonly skipInstallTrust?: boolean | undefined;
  readonly adminOff?: boolean | undefined;
  readonly adminEnforceOrigin?: boolean | undefined;
  readonly httpPort?: number | undefined;
  readonly httpsPort?: number | undefined;
  readonly autoHttps?:
    | "off"
    | "disable_redirects"
    | "disable_certs"
    | "ignore_loaded_certs"
    | undefined;
  readonly servers?:
    | Readonly<
        Record<
          string,
          {
            readonly listen?: readonly string[] | undefined;
            readonly protocols?: readonly string[] | undefined;
            readonly strictSniHost?: boolean | undefined;
          }
        >
      >
    | undefined;
  readonly logFormat?: "console" | "json" | undefined;
  readonly logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR" | undefined;
}

export const globalOptionsSchema: Schema.Schema<GlobalOptions> = Schema.Struct({
  debug: Schema.optional(Schema.Boolean),
  email: Schema.optional(
    Schema.String.pipe(
      Schema.filter(isValidEmail, { message: (): string => "Invalid email address" })
    )
  ),
  acmeCA: Schema.optional(
    Schema.String.pipe(Schema.filter(isValidUrl, { message: (): string => "Invalid URL" }))
  ),
  acmeCaRoot: Schema.optional(Schema.String),
  localCerts: Schema.optional(Schema.Boolean),
  skipInstallTrust: Schema.optional(Schema.Boolean),
  adminOff: Schema.optional(Schema.Boolean),
  adminEnforceOrigin: Schema.optional(Schema.Boolean),
  httpPort: Schema.optional(Schema.Number.pipe(Schema.int())),
  httpsPort: Schema.optional(Schema.Number.pipe(Schema.int())),
  autoHttps: Schema.optional(
    Schema.Literal("off", "disable_redirects", "disable_certs", "ignore_loaded_certs")
  ),
  servers: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Struct({
        listen: Schema.optional(Schema.Array(Schema.String)),
        protocols: Schema.optional(Schema.Array(Schema.String)),
        strictSniHost: Schema.optional(Schema.Boolean),
      }),
    })
  ),
  logFormat: Schema.optional(Schema.Literal("console", "json")),
  logLevel: Schema.optional(Schema.Literal("DEBUG", "INFO", "WARN", "ERROR")),
});

/**
 * Caddyfile configuration.
 */
export interface CaddyfileConfig {
  readonly global?: GlobalOptions | undefined;
  readonly snippets?: readonly Snippet[] | undefined;
  readonly sites: readonly Site[];
}

export const caddyfileSchema: Schema.Schema<CaddyfileConfig> = Schema.Struct({
  global: Schema.optional(globalOptionsSchema),
  snippets: Schema.optional(Schema.Array(snippetSchema)),
  sites: Schema.Array(siteSchema),
});

/**
 * Caddy container configuration (output after decoding).
 * Similar to ContainerBaseConfig but with Caddy-specific defaults applied.
 */
export interface CaddyContainerConfig {
  readonly image: string;
  readonly imageDigest?: string | undefined;
  readonly networkMode: "pasta" | "slirp4netns" | "host" | "none";
  readonly ports: readonly PortConfig[];
  readonly volumes?: readonly VolumeMountConfig[] | undefined;
  readonly environment?: Readonly<Record<string, string>> | undefined;
  readonly environmentFiles?: readonly string[] | undefined;
  readonly healthCheck?: HealthCheckConfig | undefined;
  readonly readOnlyRootfs: boolean;
  readonly noNewPrivileges: boolean;
  readonly capAdd?: readonly string[] | undefined;
  readonly capDrop?: readonly string[] | undefined;
  readonly seccompProfile?: string | undefined;
  readonly shmSize?: string | undefined;
  readonly devices?: readonly string[] | undefined;
  readonly autoUpdate: "registry" | "local" | false;
  readonly restart: ServiceRestartPolicy;
  readonly restartSec?: number | undefined;
  readonly timeoutStartSec?: number | undefined;
  readonly timeoutStopSec?: number | undefined;
}

/**
 * Caddy container configuration (input before decoding).
 */
export interface CaddyContainerConfigInput {
  readonly image: string;
  readonly imageDigest?: string | undefined;
  readonly networkMode?: "pasta" | "slirp4netns" | "host" | "none" | undefined;
  readonly ports?: readonly PortConfigInput[] | undefined;
  readonly volumes?: readonly VolumeMountConfig[] | undefined;
  readonly environment?: Readonly<Record<string, string>> | undefined;
  readonly environmentFiles?: readonly string[] | undefined;
  readonly healthCheck?: HealthCheckConfigInput | undefined;
  readonly readOnlyRootfs?: boolean | undefined;
  readonly noNewPrivileges?: boolean | undefined;
  readonly capAdd?: readonly string[] | undefined;
  readonly capDrop?: readonly string[] | undefined;
  readonly seccompProfile?: string | undefined;
  readonly shmSize?: string | undefined;
  readonly devices?: readonly string[] | undefined;
  readonly autoUpdate?: "registry" | "local" | false | undefined;
  readonly restart?: ServiceRestartPolicy | undefined;
  readonly restartSec?: number | undefined;
  readonly timeoutStartSec?: number | undefined;
  readonly timeoutStopSec?: number | undefined;
}

export const caddyContainerSchema: Schema.Schema<CaddyContainerConfig, CaddyContainerConfigInput> =
  Schema.Struct({
    image: Schema.String.pipe(
      Schema.pattern(/^[\w./-]+(:[\w.-]+)?(@sha256:[a-f0-9]+)?$/, {
        message: (): string => "Invalid container image format",
      })
    ),
    imageDigest: Schema.optional(Schema.String),
    networkMode: Schema.optionalWith(Schema.Literal("pasta", "slirp4netns", "host", "none"), {
      default: (): "pasta" => "pasta",
    }),
    ports: Schema.optionalWith(Schema.Array(portSchema), {
      default: (): PortConfig[] => [
        { host: 80, container: 80, protocol: "tcp" },
        { host: 443, container: 443, protocol: "tcp" },
        { host: 443, container: 443, protocol: "udp" },
      ],
    }),
    volumes: Schema.optional(
      Schema.Array(
        Schema.Struct({
          source: Schema.String,
          target: Schema.String,
          options: Schema.optional(Schema.String),
        })
      )
    ),
    environment: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
    environmentFiles: Schema.optional(Schema.Array(Schema.String)),
    healthCheck: Schema.optional(
      Schema.Struct({
        cmd: Schema.String,
        interval: Schema.optionalWith(Schema.String, { default: (): string => "30s" }),
        timeout: Schema.optionalWith(Schema.String, { default: (): string => "30s" }),
        retries: Schema.optionalWith(
          Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
          {
            default: (): number => 3,
          }
        ),
        startPeriod: Schema.optionalWith(Schema.String, { default: (): string => "0s" }),
        onFailure: Schema.optionalWith(Schema.Literal("none", "kill", "restart", "stop"), {
          default: (): "none" => "none",
        }),
      })
    ),
    readOnlyRootfs: Schema.optionalWith(Schema.Boolean, { default: (): boolean => false }),
    noNewPrivileges: Schema.optionalWith(Schema.Boolean, { default: (): boolean => true }),
    capAdd: Schema.optional(Schema.Array(Schema.String)),
    capDrop: Schema.optional(Schema.Array(Schema.String)),
    seccompProfile: Schema.optional(Schema.String),
    shmSize: Schema.optional(Schema.String),
    devices: Schema.optional(Schema.Array(Schema.String)),
    autoUpdate: Schema.optionalWith(
      Schema.Union(Schema.Literal("registry", "local"), Schema.Literal(false)),
      {
        default: (): "registry" => "registry",
      }
    ),
    restart: Schema.optionalWith(
      Schema.Literal("no", "on-success", "on-failure", "on-abnormal", "on-abort", "always"),
      { default: (): "on-failure" => "on-failure" }
    ),
    restartSec: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0))),
    timeoutStartSec: Schema.optional(
      Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0))
    ),
    timeoutStopSec: Schema.optional(
      Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0))
    ),
  });

/**
 * Network configuration schema.
 */
const caddyNetworkSchema = Schema.Struct({
  mapHostLoopback: Schema.optional(Schema.String),
});

/**
 * Full Caddy service configuration (output after decoding).
 */
export interface CaddyConfig {
  readonly paths: {
    readonly dataDir: string;
  };
  readonly container?: CaddyContainerConfig | undefined;
  readonly network?:
    | {
        readonly mapHostLoopback?: string | undefined;
      }
    | undefined;
  readonly caddyfile: CaddyfileConfig;
}

/**
 * Full Caddy service configuration (input before decoding).
 */
export interface CaddyConfigInput {
  readonly paths: {
    readonly dataDir: string;
  };
  readonly container?: CaddyContainerConfigInput | undefined;
  readonly network?:
    | {
        readonly mapHostLoopback?: string | undefined;
      }
    | undefined;
  readonly caddyfile: CaddyfileConfig;
}

export const caddyConfigSchema: Schema.Schema<CaddyConfig, CaddyConfigInput> = Schema.Struct({
  paths: Schema.Struct({
    dataDir: absolutePathSchema,
  }),
  container: Schema.optional(caddyContainerSchema),
  network: Schema.optional(caddyNetworkSchema),
  caddyfile: caddyfileSchema,
});
