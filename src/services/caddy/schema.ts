// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddy reverse proxy service configuration schema.
 */

import { Schema } from "effect";
import {
  AUTO_UPDATE_STRING_VALUES,
  type AutoUpdateString,
  HEALTH_CHECK_ON_FAILURE_VALUES,
  NETWORK_MODE_VALUES,
  type NetworkMode,
  SERVICE_RESTART_VALUES,
  type ServiceRestartPolicy,
} from "../../config/field-values";
import {
  type HealthCheckConfig,
  type HealthCheckConfigInput,
  type PortConfig,
  type PortConfigInput,
  type VolumeMountConfig,
  type VolumeMountConfigInput,
  absolutePathSchema,
  containerImageSchema,
  portSchema,
  volumeMountSchema,
} from "../../config/schema";
import { isValidEmail, isValidUrl } from "../../lib/schema-utils";
import {
  type AbsolutePath,
  type ContainerImage,
  type DurationString,
  DurationStringSchema,
  duration,
} from "../../lib/types";
import {
  type DivbanConfigSchemaVersion,
  DivbanConfigSchemaVersionSchema,
} from "../../lib/versioning";

// exactOptionalPropertyTypes requires explicit undefined; readonly matches Effect Schema output
export interface Directive {
  readonly name: string;
  readonly args?: readonly string[] | undefined;
  readonly block?: readonly Directive[] | undefined;
}

// Type erasure: Schema.suspend() produces a structural type incompatible with the interface.
export const directiveSchema: Schema.Schema<Directive> = Schema.Struct({
  name: Schema.String,
  args: Schema.optional(Schema.Array(Schema.String)),
  block: Schema.optional(
    Schema.suspend((): Schema.Schema<readonly Directive[]> => Schema.Array(directiveSchema))
  ),
}) as unknown as Schema.Schema<Directive>;

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

// Type erasure: `not` references NamedMatcher recursively. See directiveSchema.
export const namedMatcherSchema: Schema.Schema<NamedMatcher> = Schema.Struct({
  name: Schema.String,
  ...matcherFieldsWithoutName,
  not: Schema.optional(Schema.Struct(matcherFieldsWithoutName)),
}) as unknown as Schema.Schema<NamedMatcher>;

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

export interface CaddyContainerConfig {
  readonly image: ContainerImage;
  readonly imageDigest?: string | undefined;
  readonly networkMode: NetworkMode;
  readonly ports: readonly PortConfig[];
  readonly volumes?: readonly VolumeMountConfig[] | undefined;
  readonly environment?: Readonly<Record<string, string>> | undefined;
  readonly environmentFiles?: readonly AbsolutePath[] | undefined;
  readonly healthCheck?: HealthCheckConfig | undefined;
  readonly readOnlyRootfs: boolean;
  readonly noNewPrivileges: boolean;
  readonly capAdd?: readonly string[] | undefined;
  readonly capDrop?: readonly string[] | undefined;
  readonly seccompProfile?: AbsolutePath | undefined;
  readonly shmSize?: string | undefined;
  readonly devices?: readonly string[] | undefined;
  readonly autoUpdate: AutoUpdateString | false;
  readonly restart: ServiceRestartPolicy;
  readonly restartSec?: number | undefined;
  readonly timeoutStartSec?: number | undefined;
  readonly timeoutStopSec?: number | undefined;
}

export interface CaddyContainerConfigInput {
  readonly image: string;
  readonly imageDigest?: string | undefined;
  readonly networkMode?: NetworkMode | undefined;
  readonly ports?: readonly PortConfigInput[] | undefined;
  readonly volumes?: readonly VolumeMountConfigInput[] | undefined;
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
  readonly autoUpdate?: (AutoUpdateString | false) | undefined;
  readonly restart?: ServiceRestartPolicy | undefined;
  readonly restartSec?: number | undefined;
  readonly timeoutStartSec?: number | undefined;
  readonly timeoutStopSec?: number | undefined;
}

export const caddyContainerSchema: Schema.Schema<CaddyContainerConfig, CaddyContainerConfigInput> =
  Schema.Struct({
    image: containerImageSchema,
    imageDigest: Schema.optional(Schema.String),
    networkMode: Schema.optionalWith(Schema.Literal(...NETWORK_MODE_VALUES), {
      default: (): "pasta" => "pasta",
    }),
    ports: Schema.optionalWith(Schema.Array(portSchema), {
      default: (): PortConfig[] => [
        { host: 80, container: 80, protocol: "tcp" },
        { host: 443, container: 443, protocol: "tcp" },
        { host: 443, container: 443, protocol: "udp" },
      ],
    }),
    volumes: Schema.optional(Schema.Array(volumeMountSchema)),
    environment: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
    environmentFiles: Schema.optional(Schema.Array(absolutePathSchema)),
    healthCheck: Schema.optional(
      Schema.Struct({
        cmd: Schema.String,
        interval: Schema.optionalWith(DurationStringSchema, {
          default: (): DurationString => duration("30s"),
        }),
        timeout: Schema.optionalWith(DurationStringSchema, {
          default: (): DurationString => duration("30s"),
        }),
        retries: Schema.optionalWith(
          Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
          {
            default: (): number => 3,
          }
        ),
        startPeriod: Schema.optionalWith(DurationStringSchema, {
          default: (): DurationString => duration("0s"),
        }),
        onFailure: Schema.optionalWith(Schema.Literal(...HEALTH_CHECK_ON_FAILURE_VALUES), {
          default: (): "none" => "none",
        }),
      })
    ),
    readOnlyRootfs: Schema.optionalWith(Schema.Boolean, { default: (): boolean => false }),
    noNewPrivileges: Schema.optionalWith(Schema.Boolean, { default: (): boolean => true }),
    capAdd: Schema.optional(Schema.Array(Schema.String)),
    capDrop: Schema.optional(Schema.Array(Schema.String)),
    seccompProfile: Schema.optional(absolutePathSchema),
    shmSize: Schema.optional(Schema.String),
    devices: Schema.optional(Schema.Array(Schema.String)),
    autoUpdate: Schema.optionalWith(
      Schema.Union(Schema.Literal(...AUTO_UPDATE_STRING_VALUES), Schema.Literal(false)),
      {
        default: (): "registry" => "registry",
      }
    ),
    restart: Schema.optionalWith(Schema.Literal(...SERVICE_RESTART_VALUES), {
      default: (): "on-failure" => "on-failure",
    }),
    restartSec: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0))),
    timeoutStartSec: Schema.optional(
      Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0))
    ),
    timeoutStopSec: Schema.optional(
      Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0))
    ),
  });

const caddyNetworkSchema = Schema.Struct({
  mapHostLoopback: Schema.optional(Schema.String),
});

export interface CaddyConfig {
  readonly divbanConfigSchemaVersion: DivbanConfigSchemaVersion;
  readonly paths: {
    readonly dataDir: AbsolutePath;
  };
  readonly container?: CaddyContainerConfig | undefined;
  readonly network?:
    | {
        readonly mapHostLoopback?: string | undefined;
      }
    | undefined;
  readonly caddyfile: CaddyfileConfig;
}

export interface CaddyConfigInput {
  readonly divbanConfigSchemaVersion: string;
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
  divbanConfigSchemaVersion: DivbanConfigSchemaVersionSchema,
  paths: Schema.Struct({
    dataDir: absolutePathSchema,
  }),
  container: Schema.optional(caddyContainerSchema),
  network: Schema.optional(caddyNetworkSchema),
  caddyfile: caddyfileSchema,
});
