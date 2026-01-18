/**
 * Caddy service configuration schema.
 */

import { z } from "zod";
import { absolutePathSchema, containerBaseSchema, portSchema } from "../../config/schema";

/**
 * Directive schema - recursive for nested directives.
 */
const baseDirectiveSchema = z.object({
  name: z.string(),
  args: z.array(z.string()).optional(),
  block: z.lazy(() => z.array(directiveSchema)).optional(),
});

export const directiveSchema: z.ZodType<Directive> = baseDirectiveSchema;

export interface Directive {
  name: string;
  args?: string[];
  block?: Directive[];
}

/**
 * Named matcher schema.
 */
export const namedMatcherSchema = z.object({
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
  not: z.lazy(() => namedMatcherSchema.omit({ name: true })).optional(),
  expression: z.string().optional(),
});

export type NamedMatcher = z.infer<typeof namedMatcherSchema>;

/**
 * Snippet schema.
 */
export const snippetSchema = z.object({
  name: z.string(),
  args: z.array(z.string()).optional(),
  directives: z.array(directiveSchema),
});

export type Snippet = z.infer<typeof snippetSchema>;

/**
 * Route schema.
 */
export const routeSchema = z.object({
  name: z.string().optional(),
  match: z.array(z.string()).optional(),
  directives: z.array(directiveSchema),
});

export type Route = z.infer<typeof routeSchema>;

/**
 * Site schema.
 */
export const siteSchema = z.object({
  addresses: z.array(z.string()),
  matchers: z.array(namedMatcherSchema).optional(),
  routes: z.array(routeSchema).optional(),
  directives: z.array(directiveSchema).optional(),
});

export type Site = z.infer<typeof siteSchema>;

/**
 * Global options schema.
 */
export const globalOptionsSchema = z.object({
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
  autoHttps: z.enum(["off", "disable_redirects", "disable_certs", "ignore_loaded_certs"]).optional(),
  servers: z.record(z.object({
    listen: z.array(z.string()).optional(),
    protocols: z.array(z.string()).optional(),
    strictSniHost: z.boolean().optional(),
  })).optional(),
  logFormat: z.enum(["console", "json"]).optional(),
  logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
});

export type GlobalOptions = z.infer<typeof globalOptionsSchema>;

/**
 * Caddyfile configuration schema.
 */
export const caddyfileSchema = z.object({
  global: globalOptionsSchema.optional(),
  snippets: z.array(snippetSchema).optional(),
  sites: z.array(siteSchema),
});

export type CaddyfileConfig = z.infer<typeof caddyfileSchema>;

/**
 * Container configuration schema (extends base).
 */
export const caddyContainerSchema = containerBaseSchema.extend({
  ports: z.array(portSchema).default([
    { host: 80, container: 80, protocol: "tcp" as const },
    { host: 443, container: 443, protocol: "tcp" as const },
    { host: 443, container: 443, protocol: "udp" as const },
  ]),
});

/**
 * Full Caddy service configuration schema.
 */
export const caddyConfigSchema = z.object({
  paths: z.object({
    dataDir: absolutePathSchema,
  }),
  container: caddyContainerSchema.optional(),
  caddyfile: caddyfileSchema,
});

export type CaddyConfig = z.infer<typeof caddyConfigSchema>;
