// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Caddy service configuration schema.
 */

import { z } from "zod";
import { type ContainerBaseConfig, absolutePathSchema, portSchema } from "../../config/schema";

/**
 * Directive schema - recursive for nested directives.
 */
const baseDirectiveSchema = z.object({
  name: z.string(),
  args: z.array(z.string()).optional(),
  block: z.lazy(() => z.array(directiveSchema)).optional(),
});

// The interface must explicitly include undefined for Zod compatibility with exactOptionalPropertyTypes
export interface Directive {
  name: string;
  args?: string[] | undefined;
  block?: Directive[] | undefined;
}

export const directiveSchema: z.ZodType<Directive> = baseDirectiveSchema;

/**
 * Named matcher interface for exactOptionalPropertyTypes compatibility.
 */
export interface NamedMatcher {
  name: string;
  path?: string[] | undefined;
  pathRegexp?: string | undefined;
  host?: string[] | undefined;
  method?: string[] | undefined;
  header?: Record<string, string> | undefined;
  headerRegexp?: Record<string, string> | undefined;
  query?: Record<string, string> | undefined;
  remoteIp?: string[] | undefined;
  protocol?: string | undefined;
  not?: Omit<NamedMatcher, "name"> | undefined;
  expression?: string | undefined;
}

/**
 * Named matcher schema.
 */
const baseNamedMatcherSchema = z.object({
  name: z.string(),
  path: z.array(z.string()).optional(),
  pathRegexp: z.string().optional(),
  host: z.array(z.string()).optional(),
  method: z.array(z.string()).optional(),
  header: z.record(z.string()).optional(),
  headerRegexp: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
  remoteIp: z.array(z.string()).optional(),
  protocol: z.string().optional(),
  not: z
    .lazy(
      (): z.ZodType<Omit<NamedMatcher, "name"> | undefined> =>
        baseNamedMatcherSchema.omit({ name: true })
    )
    .optional(),
  expression: z.string().optional(),
});

export const namedMatcherSchema: z.ZodType<NamedMatcher> = baseNamedMatcherSchema;

/**
 * Snippet schema.
 */
/** Caddyfile snippet */
export interface Snippet {
  name: string;
  args?: string[] | undefined;
  directives: Directive[];
}

export const snippetSchema: z.ZodType<Snippet> = z.object({
  name: z.string(),
  args: z.array(z.string()).optional(),
  directives: z.array(directiveSchema),
});

/**
 * Caddyfile route.
 */
export interface Route {
  name?: string | undefined;
  match?: string[] | undefined;
  directives: Directive[];
}

export const routeSchema: z.ZodType<Route> = z.object({
  name: z.string().optional(),
  match: z.array(z.string()).optional(),
  directives: z.array(directiveSchema),
});

/**
 * Caddyfile site.
 */
export interface Site {
  addresses: string[];
  matchers?: NamedMatcher[] | undefined;
  routes?: Route[] | undefined;
  directives?: Directive[] | undefined;
}

export const siteSchema: z.ZodType<Site> = z.object({
  addresses: z.array(z.string()),
  matchers: z.array(namedMatcherSchema).optional(),
  routes: z.array(routeSchema).optional(),
  directives: z.array(directiveSchema).optional(),
});

/**
 * Caddy global options.
 */
export interface GlobalOptions {
  debug?: boolean | undefined;
  email?: string | undefined;
  acmeCA?: string | undefined;
  acmeCaRoot?: string | undefined;
  localCerts?: boolean | undefined;
  skipInstallTrust?: boolean | undefined;
  adminOff?: boolean | undefined;
  adminEnforceOrigin?: boolean | undefined;
  httpPort?: number | undefined;
  httpsPort?: number | undefined;
  autoHttps?: "off" | "disable_redirects" | "disable_certs" | "ignore_loaded_certs" | undefined;
  servers?:
    | Record<
        string,
        {
          listen?: string[] | undefined;
          protocols?: string[] | undefined;
          strictSniHost?: boolean | undefined;
        }
      >
    | undefined;
  logFormat?: "console" | "json" | undefined;
  logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR" | undefined;
}

export const globalOptionsSchema: z.ZodType<GlobalOptions> = z.object({
  debug: z.boolean().optional(),
  email: z.string().email().optional(),
  acmeCA: z.string().url().optional(),
  acmeCaRoot: z.string().optional(),
  localCerts: z.boolean().optional(),
  skipInstallTrust: z.boolean().optional(),
  adminOff: z.boolean().optional(),
  adminEnforceOrigin: z.boolean().optional(),
  httpPort: z.number().int().optional(),
  httpsPort: z.number().int().optional(),
  autoHttps: z
    .enum(["off", "disable_redirects", "disable_certs", "ignore_loaded_certs"])
    .optional(),
  servers: z
    .record(
      z.object({
        listen: z.array(z.string()).optional(),
        protocols: z.array(z.string()).optional(),
        strictSniHost: z.boolean().optional(),
      })
    )
    .optional(),
  logFormat: z.enum(["console", "json"]).optional(),
  logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
});

/**
 * Caddyfile configuration.
 */
export interface CaddyfileConfig {
  global?: GlobalOptions | undefined;
  snippets?: Snippet[] | undefined;
  sites: Site[];
}

export const caddyfileSchema: z.ZodType<CaddyfileConfig> = z.object({
  global: globalOptionsSchema.optional(),
  snippets: z.array(snippetSchema).optional(),
  sites: z.array(siteSchema),
});

/**
 * Container configuration schema (extends base).
 */
const caddyContainerSchemaRaw = z.object({
  image: z.string().regex(/^[\w./-]+(:[\w.-]+)?(@sha256:[a-f0-9]+)?$/),
  imageDigest: z.string().optional(),
  networkMode: z.enum(["pasta", "slirp4netns", "host", "none"]).default("pasta"),
  ports: z.array(portSchema).default([
    { host: 80, container: 80, protocol: "tcp" as const },
    { host: 443, container: 443, protocol: "tcp" as const },
    { host: 443, container: 443, protocol: "udp" as const },
  ]),
  volumes: z
    .array(z.object({ source: z.string(), target: z.string(), options: z.string().optional() }))
    .optional(),
  environment: z.record(z.string()).optional(),
  environmentFiles: z.array(z.string()).optional(),
  healthCheck: z
    .object({
      cmd: z.string(),
      interval: z.string().default("30s"),
      timeout: z.string().default("30s"),
      retries: z.number().int().min(1).default(3),
      startPeriod: z.string().default("0s"),
      onFailure: z.enum(["none", "kill", "restart", "stop"]).default("none"),
    })
    .optional(),
  readOnlyRootfs: z.boolean().default(false),
  noNewPrivileges: z.boolean().default(true),
  capAdd: z.array(z.string()).optional(),
  capDrop: z.array(z.string()).optional(),
  seccompProfile: z.string().optional(),
  shmSize: z.string().optional(),
  devices: z.array(z.string()).optional(),
  autoUpdate: z.enum(["registry", "local"]).or(z.literal(false)).default("registry"),
  restart: z
    .enum(["no", "on-success", "on-failure", "on-abnormal", "on-abort", "always"])
    .default("on-failure"),
  restartSec: z.number().int().min(0).optional(),
  timeoutStartSec: z.number().int().min(0).optional(),
  timeoutStopSec: z.number().int().min(0).optional(),
});

export const caddyContainerSchema: z.ZodType<ContainerBaseConfig> =
  caddyContainerSchemaRaw as z.ZodType<ContainerBaseConfig>;

/**
 * Full Caddy service configuration.
 */
export interface CaddyConfig {
  paths: {
    dataDir: string;
  };
  container?: ContainerBaseConfig | undefined;
  caddyfile: CaddyfileConfig;
}

export const caddyConfigSchema: z.ZodType<CaddyConfig> = z.object({
  paths: z.object({
    dataDir: absolutePathSchema,
  }),
  container: caddyContainerSchemaRaw.optional(),
  caddyfile: caddyfileSchema,
}) as z.ZodType<CaddyConfig>;
