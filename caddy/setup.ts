#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
//═══════════════════════════════════════════════════════════════════════════════
// setup.ts - Generic TOML-Based Caddy Configuration Generator for Rootless Podman
//
// DESCRIPTION:
//   A completely generic Caddy configuration system where:
//   - TOML can express any valid Caddyfile
//   - Users can define any directive, matcher, subdirective
//   - Generator produces correct Caddyfile syntax
//   - Works with rootless Podman quadlets for deployment
//
// REQUIREMENTS:
//   Bun 1.0+
//   Podman 4.4+ (5.0+ recommended)
//   systemd with user lingering support
//
// USAGE:
//   bun run setup.ts generate --config cloudlab-caddy.toml --output ./out/
//   bun run setup.ts validate --config cloudlab-caddy.toml
//   sudo bun run setup.ts setup --config cloudlab-caddy.toml
//   sudo bun run setup.ts start --config cloudlab-caddy.toml
//   sudo bun run setup.ts status --config cloudlab-caddy.toml
//   sudo bun run setup.ts logs --config cloudlab-caddy.toml
//
// SUBCOMMANDS:
//   generate    Generate Caddyfile and quadlet files without deploying
//   validate    Validate TOML configuration syntax
//   diff        Show what would change compared to deployed files
//   setup       Generate and deploy configuration (requires root)
//   start       Start the Caddy service
//   stop        Stop the Caddy service
//   restart     Restart the Caddy service
//   reload      Reload Caddy configuration
//   status      Show service status
//   logs        View service logs
//
// LICENSE: MIT
//═══════════════════════════════════════════════════════════════════════════════

import { $ } from "bun";
import { parseArgs } from "util";
import { z } from "zod";
import * as TOML from "smol-toml";

//═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
//═══════════════════════════════════════════════════════════════════════════════

// Branded types for nominal typing
type UserId = number & { readonly __brand: "UserId" };
type SubordinateId = number & { readonly __brand: "SubordinateId" };
type AbsolutePath = string & { readonly __brand: "AbsolutePath" };
type Username = string & { readonly __brand: "Username" };

// Result type for operations
type Result<T, E = SetupError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// Command execution result
interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly command: string;
  readonly dryRun: boolean;
}

// Step execution result
type StepResult =
  | { readonly status: "completed"; readonly message: string }
  | { readonly status: "skipped"; readonly reason: string }
  | { readonly status: "failed"; readonly error: SetupError };

//═══════════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS - TOML CONFIGURATION
//═══════════════════════════════════════════════════════════════════════════════

// Basic branded type schemas
const UserIdSchema = z
  .number()
  .int()
  .min(0, "UID must be >= 0")
  .max(65534, "UID must be <= 65534")
  .transform((n): UserId => n as UserId);

const SubordinateIdSchema = z
  .number()
  .int()
  .min(100000, "Subordinate UID must be >= 100000")
  .transform((n): SubordinateId => n as SubordinateId);

const AbsolutePathSchema = z
  .string()
  .refine((s) => s.startsWith("/"), "Path must be absolute (start with /)")
  .transform((s): AbsolutePath => s as AbsolutePath);

const UsernameSchema = z
  .string()
  .regex(/^[a-z_][a-z0-9_-]*$/, "Invalid username format")
  .max(32, "Username too long")
  .transform((s): Username => s as Username);

//───────────────────────────────────────────────────────────────────────────────
// Service Configuration Schema (Podman/Quadlet)
//───────────────────────────────────────────────────────────────────────────────

const ServiceSchema = z.object({
  user: UsernameSchema,
  uid: UserIdSchema,
  subuid_start: SubordinateIdSchema,
  subuid_range: z.number().int().positive().default(65536),
});

const PathsSchema = z.object({
  data_dir: AbsolutePathSchema,
});

const PortMappingSchema = z.object({
  host: z.number().int().min(1).max(65535),
  container: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});

const HealthCheckSchema = z.object({
  cmd: z.string().optional(),
  interval: z.string().default("30s"),
  timeout: z.string().default("10s"),
  retries: z.number().int().positive().default(3),
  start_period: z.string().optional(),
  on_failure: z.enum(["none", "kill", "stop", "restart"]).optional(),
});

const VolumeMountSchema = z.object({
  host: z.string(),
  container: z.string(),
  options: z.string().optional(), // e.g., "ro", "ro,Z", etc.
});

const ContainerSchema = z.object({
  name: z.string().default("caddy"),
  image: z.string().default("docker.io/library/caddy:2-alpine"),
  network_mode: z.enum(["pasta", "slirp4netns"]).default("pasta"),
  ports: z.array(PortMappingSchema).default([
    { host: 80, container: 80, protocol: "tcp" },
    { host: 443, container: 443, protocol: "tcp" },
    { host: 443, container: 443, protocol: "udp" },
  ]),
  volumes: z.array(VolumeMountSchema).optional(),
  health: HealthCheckSchema.optional(),
  // Security options
  no_new_privileges: z.boolean().optional(),
  read_only_rootfs: z.boolean().optional(),
  log_driver: z.string().optional(),
  // Service options
  restart: z.enum(["no", "always", "on-failure", "unless-stopped"]).default("on-failure"),
  restart_sec: z.number().int().positive().default(10),
  timeout_start_sec: z.number().int().positive().optional(),
  timeout_stop_sec: z.number().int().positive().optional(),
  // Unit options
  documentation: z.string().optional(),
  requires: z.array(z.string()).optional(),
  start_limit_burst: z.number().int().positive().optional(),
  start_limit_interval_sec: z.number().int().positive().optional(),
});

//───────────────────────────────────────────────────────────────────────────────
// Caddyfile Configuration Schema (Generic)
//───────────────────────────────────────────────────────────────────────────────

// Recursive directive type for unlimited nesting
interface Directive {
  directive: string;
  matcher?: string;
  args?: (string | number | boolean)[];
  block?: Directive[];
}

const DirectiveSchema: z.ZodType<Directive> = z.lazy(() =>
  z.object({
    directive: z.string(),
    matcher: z.string().optional(),
    args: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
    block: z.array(DirectiveSchema).optional(),
  })
);

// Header field/value pair for header directive
const HeaderArgSchema = z.object({
  field: z.string(),
  value: z.string().optional(),
});

// Named matcher schema - supports all Caddy matcher types
const MatcherSchema = z.object({
  name: z.string(),
  path: z.array(z.string()).optional(),
  host: z.array(z.string()).optional(),
  method: z.array(z.string()).optional(),
  header: z.record(z.string()).optional(),
  header_regexp: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
  remote_ip: z.array(z.string()).optional(),
  client_ip: z.array(z.string()).optional(),
  protocol: z.string().optional(),
  expression: z.string().optional(),
  not: z
    .object({
      path: z.array(z.string()).optional(),
      host: z.array(z.string()).optional(),
      method: z.array(z.string()).optional(),
      header: z.record(z.string()).optional(),
      expression: z.string().optional(),
    })
    .optional(),
});

type Matcher = z.infer<typeof MatcherSchema>;

// Snippet schema
const SnippetDirectiveSchema = z.object({
  directive: z.string(),
  args: z
    .array(
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        HeaderArgSchema, // For header directive with field/value pairs
      ])
    )
    .optional(),
  block: z.array(DirectiveSchema).optional(),
});

const SnippetSchema = z.object({
  name: z.string(),
  raw: z.string().optional(),
  directives: z.array(SnippetDirectiveSchema).optional(),
});

type Snippet = z.infer<typeof SnippetSchema>;

// Site schema
const SiteSchema = z.object({
  addresses: z.union([z.string(), z.array(z.string())]),
  raw: z.string().optional(),
  matchers: z.array(MatcherSchema).optional(),
  directives: z.array(DirectiveSchema).optional(),
});

type Site = z.infer<typeof SiteSchema>;

// Named route schema (same structure as snippet)
const NamedRouteSchema = z.object({
  name: z.string(),
  raw: z.string().optional(),
  directives: z.array(DirectiveSchema).optional(),
});

// Full Caddyfile schema
const CaddyfileSchema = z.object({
  global: z.record(z.any()).optional(),
  snippets: z.array(SnippetSchema).optional(),
  named_routes: z.array(NamedRouteSchema).optional(),
  sites: z.array(SiteSchema),
});

type CaddyfileConfig = z.infer<typeof CaddyfileSchema>;

// Complete TOML configuration schema
const TomlConfigSchema = z.object({
  service: ServiceSchema,
  paths: PathsSchema,
  container: ContainerSchema.optional(),
  caddyfile: CaddyfileSchema,
});

type TomlConfig = z.infer<typeof TomlConfigSchema>;

//───────────────────────────────────────────────────────────────────────────────
// Runtime Configuration Schema
//───────────────────────────────────────────────────────────────────────────────

const RuntimeConfigSchema = z.object({
  tomlConfig: TomlConfigSchema,
  configPath: AbsolutePathSchema,
  scriptDir: AbsolutePathSchema,
  dryRun: z.boolean(),
  verbose: z.boolean(),
});

type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

//═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
//═══════════════════════════════════════════════════════════════════════════════

const SCRIPT_NAME = "setup.ts";
const SCRIPT_VERSION = "0.2.0";

const SUBUID_RANGE_DEFAULT = 65536;

const REQUIRED_COMMANDS = [
  "podman",
  "systemctl",
  "loginctl",
  "useradd",
  "getent",
  "mkdir",
  "cp",
  "chmod",
  "chown",
  "install",
  "sysctl",
] as const;

const ExitCode = {
  Success: 0,
  GeneralError: 1,
  InvalidArgs: 2,
  RootRequired: 3,
  DependencyMissing: 4,
  ConfigError: 5,
} as const;

type ExitCodeKey = keyof typeof ExitCode;

//═══════════════════════════════════════════════════════════════════════════════
// ERROR CLASSES
//═══════════════════════════════════════════════════════════════════════════════

class SetupError extends Error {
  constructor(
    message: string,
    readonly code: ExitCodeKey,
    readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SetupError";
    Error.captureStackTrace?.(this, this.constructor);
  }

  get exitCode(): number {
    return ExitCode[this.code];
  }
}

class RootRequiredError extends SetupError {
  constructor() {
    super("This command must be run as root", "RootRequired");
  }
}

class DependencyMissingError extends SetupError {
  constructor(commands: readonly string[]) {
    super(`Missing required commands: ${commands.join(", ")}`, "DependencyMissing", {
      commands,
    });
  }
}

class CommandFailedError extends SetupError {
  constructor(command: string, exitCode: number, stderr: string) {
    super(`Command failed: ${command}`, "GeneralError", {
      command,
      exitCode,
      stderr,
    });
  }
}

class FileNotFoundError extends SetupError {
  constructor(path: string) {
    super(`File not found: ${path}`, "GeneralError", { path });
  }
}

class ValidationError extends SetupError {
  constructor(message: string, details?: z.ZodError) {
    super(message, "InvalidArgs", {
      issues: details?.issues,
    });
  }
}

class ConfigError extends SetupError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "ConfigError", details);
  }
}

//═══════════════════════════════════════════════════════════════════════════════
// LOGGING
//═══════════════════════════════════════════════════════════════════════════════

const COLORS = {
  red: "\x1b[0;31m",
  green: "\x1b[0;32m",
  yellow: "\x1b[0;33m",
  blue: "\x1b[0;34m",
  cyan: "\x1b[0;36m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
} as const;

function getColors(): typeof COLORS | Record<keyof typeof COLORS, ""> {
  const isTTY = process.stdout.isTTY && process.env["TERM"] !== "dumb";
  if (!isTTY) {
    return {
      red: "",
      green: "",
      yellow: "",
      blue: "",
      cyan: "",
      bold: "",
      reset: "",
    };
  }
  return COLORS;
}

function createLogger(verbose: boolean) {
  const c = getColors();

  const formatLevel = (level: string, color: keyof typeof COLORS): string =>
    `${c[color]}[${level.padEnd(5)}]${c.reset}`;

  return {
    info: (msg: string) => console.log(`${formatLevel("INFO", "blue")} ${msg}`),
    success: (msg: string) => console.log(`${formatLevel("OK", "green")} ${msg}`),
    warn: (msg: string) => console.error(`${formatLevel("WARN", "yellow")} ${msg}`),
    error: (msg: string) => console.error(`${formatLevel("ERROR", "red")} ${msg}`),
    debug: (msg: string) => {
      if (verbose) {
        console.log(`${formatLevel("DEBUG", "cyan")} ${msg}`);
      }
    },
    step: (num: number, total: number, desc: string) => {
      console.log(`\n${c.bold}${c.blue}[Step ${num}/${total}]${c.reset} ${desc}`);
    },
  };
}

type Logger = ReturnType<typeof createLogger>;

//═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
//═══════════════════════════════════════════════════════════════════════════════

const Result = {
  ok: <T>(value: T): Result<T, never> => ({ ok: true, value }),
  err: <E>(error: E): Result<never, E> => ({ ok: false, error }),
};

async function execute(
  dryRun: boolean,
  log: Logger,
  command: string
): Promise<CommandResult> {
  if (dryRun) {
    log.info(`[DRY-RUN] Would execute: ${command}`);
    return {
      exitCode: 0,
      stdout: "",
      stderr: "",
      command,
      dryRun: true,
    };
  }

  log.debug(`Executing: ${command}`);

  try {
    const result = await $`sh -c ${command}`.nothrow().quiet();
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      command,
      dryRun: false,
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      command,
      dryRun: false,
    };
  }
}

async function userExists(username: Username): Promise<boolean> {
  const result = await $`getent passwd ${username}`.nothrow().quiet();
  return result.exitCode === 0;
}

async function getUserId(username: Username): Promise<number | null> {
  const result = await $`id -u ${username}`.nothrow().quiet();
  if (result.exitCode !== 0) return null;
  const uid = parseInt(result.stdout.toString().trim(), 10);
  return isNaN(uid) ? null : uid;
}

async function subuidConfigured(username: Username): Promise<boolean> {
  try {
    const content = await Bun.file("/etc/subuid").text();
    return content.includes(`${username}:`);
  } catch {
    return false;
  }
}

async function isLingerEnabled(username: Username): Promise<boolean> {
  const result = await $`loginctl show-user ${username} -p Linger`.nothrow().quiet();
  if (result.exitCode !== 0) return false;
  return result.stdout.toString().includes("Linger=yes");
}

async function getSysctlValue(key: string): Promise<number | null> {
  const result = await $`sysctl -n ${key}`.nothrow().quiet();
  if (result.exitCode !== 0) return null;
  const value = parseInt(result.stdout.toString().trim(), 10);
  return isNaN(value) ? null : value;
}

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const result = await $`test -d ${path}`.nothrow().quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

//═══════════════════════════════════════════════════════════════════════════════
// TOML CONFIGURATION LOADING
//═══════════════════════════════════════════════════════════════════════════════

async function loadTomlConfig(configPath: string): Promise<Result<TomlConfig, SetupError>> {
  try {
    if (!(await fileExists(configPath))) {
      return Result.err(new FileNotFoundError(configPath));
    }

    const content = await Bun.file(configPath).text();
    const parsed = TOML.parse(content);

    const result = TomlConfigSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n  ");
      return Result.err(new ConfigError(`Invalid configuration:\n  ${issues}`));
    }

    return Result.ok(result.data);
  } catch (error) {
    if (error instanceof SetupError) {
      return Result.err(error);
    }
    return Result.err(
      new ConfigError(
        `Failed to parse TOML: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

//═══════════════════════════════════════════════════════════════════════════════
// CADDYFILE GENERATOR
//═══════════════════════════════════════════════════════════════════════════════

/**
 * Format an argument for Caddyfile output
 * Quotes strings that contain spaces
 */
function formatArg(arg: string | number | boolean): string {
  if (typeof arg === "boolean") {
    return arg ? "true" : "false";
  }
  if (typeof arg === "number") {
    return String(arg);
  }
  // Quote strings with spaces
  if (arg.includes(" ") && !arg.startsWith('"') && !arg.startsWith("'")) {
    return `"${arg}"`;
  }
  return arg;
}

/**
 * Indent a multi-line string
 */
function indent(text: string, depth: number): string {
  const prefix = "\t".repeat(depth);
  return text
    .split("\n")
    .map((line) => (line.trim() ? prefix + line : line))
    .join("\n");
}

/**
 * Generate global options block
 */
function generateGlobalOptions(global: Record<string, unknown>): string[] {
  const lines: string[] = [];

  if (Object.keys(global).length === 0) {
    return lines;
  }

  lines.push("{");

  for (const [key, value] of Object.entries(global)) {
    if (value === null || value === undefined) continue;

    // Handle nested options with dot notation
    if (typeof value === "object" && !Array.isArray(value)) {
      // Nested object - flatten with dots
      const flattenObject = (obj: Record<string, unknown>, prefix: string): void => {
        for (const [k, v] of Object.entries(obj)) {
          const fullKey = prefix ? `${prefix}.${k}` : k;
          if (typeof v === "object" && v !== null && !Array.isArray(v)) {
            flattenObject(v as Record<string, unknown>, fullKey);
          } else {
            lines.push(`\t${fullKey} ${formatValue(v)}`);
          }
        }
      };
      flattenObject(value as Record<string, unknown>, key);
    } else {
      lines.push(`\t${key} ${formatValue(value)}`);
    }
  }

  lines.push("}");
  lines.push("");

  return lines;
}

/**
 * Format a value for Caddyfile output
 */
function formatValue(value: unknown): string {
  if (typeof value === "boolean") {
    // Some global options use on/off, others use true/false
    return value ? "on" : "off";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    // Quote if contains spaces
    if (value.includes(" ") && !value.startsWith('"')) {
      return `"${value}"`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => formatArg(String(v))).join(" ");
  }
  return String(value);
}

/**
 * Generate a named matcher block
 */
function generateMatcher(matcher: Matcher, depth: number): string[] {
  const lines: string[] = [];
  const ind = "\t".repeat(depth);

  lines.push(`${ind}@${matcher.name} {`);

  if (matcher.path) {
    lines.push(`${ind}\tpath ${matcher.path.join(" ")}`);
  }
  if (matcher.host) {
    lines.push(`${ind}\thost ${matcher.host.join(" ")}`);
  }
  if (matcher.method) {
    lines.push(`${ind}\tmethod ${matcher.method.join(" ")}`);
  }
  if (matcher.header) {
    for (const [field, value] of Object.entries(matcher.header)) {
      lines.push(`${ind}\theader ${field} ${value}`);
    }
  }
  if (matcher.header_regexp) {
    for (const [field, value] of Object.entries(matcher.header_regexp)) {
      lines.push(`${ind}\theader_regexp ${field} ${value}`);
    }
  }
  if (matcher.query) {
    for (const [key, value] of Object.entries(matcher.query)) {
      lines.push(`${ind}\tquery ${key}=${value}`);
    }
  }
  if (matcher.remote_ip) {
    lines.push(`${ind}\tremote_ip ${matcher.remote_ip.join(" ")}`);
  }
  if (matcher.client_ip) {
    lines.push(`${ind}\tclient_ip ${matcher.client_ip.join(" ")}`);
  }
  if (matcher.protocol) {
    lines.push(`${ind}\tprotocol ${matcher.protocol}`);
  }
  if (matcher.expression) {
    lines.push(`${ind}\texpression ${matcher.expression}`);
  }
  if (matcher.not) {
    lines.push(`${ind}\tnot {`);
    if (matcher.not.path) {
      lines.push(`${ind}\t\tpath ${matcher.not.path.join(" ")}`);
    }
    if (matcher.not.host) {
      lines.push(`${ind}\t\thost ${matcher.not.host.join(" ")}`);
    }
    if (matcher.not.method) {
      lines.push(`${ind}\t\tmethod ${matcher.not.method.join(" ")}`);
    }
    if (matcher.not.header) {
      for (const [field, value] of Object.entries(matcher.not.header)) {
        lines.push(`${ind}\t\theader ${field} ${value}`);
      }
    }
    if (matcher.not.expression) {
      lines.push(`${ind}\t\texpression ${matcher.not.expression}`);
    }
    lines.push(`${ind}\t}`);
  }

  lines.push(`${ind}}`);

  return lines;
}

/**
 * Generate directives recursively
 */
function generateDirectives(directives: Directive[] | undefined, depth: number): string[] {
  const lines: string[] = [];
  if (!directives) return lines;

  const ind = "\t".repeat(depth);

  for (const dir of directives) {
    // Build directive line: directive [matcher] [args...]
    let line = `${ind}${dir.directive}`;

    if (dir.matcher) {
      line += ` ${dir.matcher}`;
    }

    if (dir.args?.length) {
      line += ` ${dir.args.map(formatArg).join(" ")}`;
    }

    // Has subdirectives?
    if (dir.block?.length) {
      line += " {";
      lines.push(line);
      lines.push(...generateDirectives(dir.block, depth + 1));
      lines.push(`${ind}}`);
    } else {
      lines.push(line);
    }
  }

  return lines;
}

/**
 * Generate snippet directives (handles header args specially)
 */
function generateSnippetDirectives(
  directives: z.infer<typeof SnippetDirectiveSchema>[] | undefined,
  depth: number
): string[] {
  const lines: string[] = [];
  if (!directives) return lines;

  const ind = "\t".repeat(depth);

  for (const dir of directives) {
    // Special handling for header directive with field/value args
    if (dir.directive === "header" && dir.args) {
      for (const arg of dir.args) {
        if (typeof arg === "object" && "field" in arg) {
          const headerArg = arg as { field: string; value?: string };
          if (headerArg.value !== undefined) {
            lines.push(`${ind}header ${headerArg.field} ${formatArg(headerArg.value)}`);
          } else {
            lines.push(`${ind}header ${headerArg.field}`);
          }
        }
      }
    } else {
      // Normal directive handling
      let line = `${ind}${dir.directive}`;

      if (dir.args?.length) {
        const formattedArgs = dir.args
          .filter((arg) => typeof arg !== "object" || !("field" in arg))
          .map((arg) => formatArg(arg as string | number | boolean));
        if (formattedArgs.length) {
          line += ` ${formattedArgs.join(" ")}`;
        }
      }

      if (dir.block?.length) {
        line += " {";
        lines.push(line);
        lines.push(...generateDirectives(dir.block, depth + 1));
        lines.push(`${ind}}`);
      } else {
        lines.push(line);
      }
    }
  }

  return lines;
}

/**
 * Generate complete Caddyfile from configuration
 */
function generateCaddyfile(config: CaddyfileConfig): string {
  const lines: string[] = [];

  // 1. Global options block
  if (config.global && Object.keys(config.global).length > 0) {
    lines.push(...generateGlobalOptions(config.global));
  }

  // 2. Snippets
  for (const snippet of config.snippets ?? []) {
    lines.push(`(${snippet.name}) {`);
    if (snippet.raw) {
      lines.push(indent(snippet.raw, 1));
    } else if (snippet.directives) {
      lines.push(...generateSnippetDirectives(snippet.directives, 1));
    }
    lines.push("}");
    lines.push("");
  }

  // 3. Named routes
  for (const route of config.named_routes ?? []) {
    lines.push(`&(${route.name}) {`);
    if (route.raw) {
      lines.push(indent(route.raw, 1));
    } else if (route.directives) {
      lines.push(...generateDirectives(route.directives, 1));
    }
    lines.push("}");
    lines.push("");
  }

  // 4. Sites
  for (const site of config.sites) {
    const addresses = Array.isArray(site.addresses)
      ? site.addresses.join(", ")
      : site.addresses;

    lines.push(`${addresses} {`);

    // Named matchers
    for (const matcher of site.matchers ?? []) {
      lines.push(...generateMatcher(matcher, 1));
      lines.push("");
    }

    // Directives or raw block
    if (site.raw) {
      lines.push(indent(site.raw, 1));
    } else if (site.directives) {
      lines.push(...generateDirectives(site.directives, 1));
    }

    lines.push("}");
    lines.push("");
  }

  return lines.join("\n");
}

//═══════════════════════════════════════════════════════════════════════════════
// QUADLET FILE GENERATORS
//═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate caddy.container quadlet file
 */
function generateContainerQuadlet(config: TomlConfig): string {
  const container = config.container ?? {
    name: "caddy",
    image: "docker.io/library/caddy:2-alpine",
    network_mode: "pasta",
    ports: [
      { host: 80, container: 80, protocol: "tcp" as const },
      { host: 443, container: 443, protocol: "tcp" as const },
      { host: 443, container: 443, protocol: "udp" as const },
    ],
    restart: "on-failure" as const,
    restart_sec: 10,
  };

  const dataDir = config.paths.data_dir;
  const lines: string[] = [];

  // [Unit] section
  lines.push("[Unit]");
  lines.push("Description=Caddy Reverse Proxy");
  if (container.documentation) {
    lines.push(`Documentation=${container.documentation}`);
  }

  // Build After= line
  const afterDeps = ["network-online.target"];
  if (container.requires?.length) {
    // Volume services are typically named like caddy-data-volume.service
    afterDeps.push(...container.requires);
  }
  lines.push(`After=${afterDeps.join(" ")}`);
  lines.push("Wants=network-online.target");

  if (container.requires?.length) {
    lines.push(`Requires=${container.requires.join(" ")}`);
  }
  if (container.start_limit_burst) {
    lines.push(`StartLimitBurst=${container.start_limit_burst}`);
  }
  if (container.start_limit_interval_sec) {
    lines.push(`StartLimitIntervalSec=${container.start_limit_interval_sec}`);
  }
  lines.push("");

  // [Container] section
  lines.push("[Container]");
  lines.push(`ContainerName=${container.name ?? "caddy"}`);
  lines.push("");
  lines.push(`Image=${container.image}`);
  lines.push("AutoUpdate=registry");
  lines.push("");
  lines.push(`Network=${container.network_mode}`);

  // Ports
  for (const p of container.ports) {
    const proto = p.protocol === "udp" ? "/udp" : "";
    lines.push(`PublishPort=${p.host}:${p.container}${proto}`);
  }
  lines.push("");

  // Volumes - use custom volumes if provided, otherwise use defaults
  if (container.volumes?.length) {
    for (const v of container.volumes) {
      const opts = v.options ? `:${v.options}` : "";
      lines.push(`Volume=${v.host}:${v.container}${opts}`);
    }
  } else {
    // Default volumes
    lines.push(`# Configuration - bind mount for easy editing`);
    lines.push(`Volume=${dataDir}/Caddyfile:/etc/caddy/Caddyfile:ro`);
    lines.push("");
    lines.push(`Volume=caddy-data.volume:/data:`);
    lines.push(`Volume=caddy-config.volume:/config:`);
    lines.push(`# Static files for file_server sites`);
    lines.push(`Volume=${dataDir}/webfiles:/webfiles:ro`);
  }
  lines.push("");

  // Health check
  const health = container.health ?? {
    cmd: "wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1",
    interval: "30s",
    timeout: "10s",
    retries: 3,
  };
  lines.push(`HealthCmd=${health.cmd}`);
  lines.push(`HealthInterval=${health.interval}`);
  lines.push(`HealthRetries=${health.retries}`);
  if (health.start_period) {
    lines.push(`HealthStartPeriod=${health.start_period}`);
  }
  if (health.timeout) {
    lines.push(`HealthTimeout=${health.timeout}`);
  }
  if (health.on_failure) {
    lines.push(`HealthOnFailure=${health.on_failure}`);
  }
  lines.push("Notify=healthy");
  lines.push("");

  // Security options
  if (container.no_new_privileges) {
    lines.push("# Security");
    lines.push("NoNewPrivileges=true");
  }
  if (container.read_only_rootfs) {
    lines.push("ReadOnlyRootfs=true");
  }
  if (container.log_driver) {
    lines.push(`LogDriver=${container.log_driver}`);
  }
  if (container.no_new_privileges || container.read_only_rootfs || container.log_driver) {
    lines.push("");
  }

  // [Service] section
  lines.push("[Service]");
  lines.push(`Restart=${container.restart}`);
  lines.push(`RestartSec=${container.restart_sec}`);
  if (container.timeout_start_sec) {
    lines.push(`TimeoutStartSec=${container.timeout_start_sec}`);
  }
  if (container.timeout_stop_sec) {
    lines.push(`TimeoutStopSec=${container.timeout_stop_sec}`);
  }
  lines.push("");

  // [Install] section
  lines.push("[Install]");
  lines.push("WantedBy=default.target");
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate caddy-data.volume quadlet file
 */
function generateDataVolumeQuadlet(): string {
  return `[Unit]
Description=Caddy TLS Certificates Volume

[Volume]
VolumeName=caddy-data

[Install]
WantedBy=default.target
`;
}

/**
 * Generate caddy-config.volume quadlet file
 */
function generateConfigVolumeQuadlet(): string {
  return `[Unit]
Description=Caddy Config Volume

[Volume]
VolumeName=caddy-config

[Install]
WantedBy=default.target
`;
}

//═══════════════════════════════════════════════════════════════════════════════
// SETUP STEPS
//═══════════════════════════════════════════════════════════════════════════════

async function setupUnprivilegedPorts(
  config: RuntimeConfig,
  log: Logger
): Promise<StepResult> {
  const SYSCTL_FILE = "/etc/sysctl.d/99-unprivileged-ports.conf";
  const SYSCTL_KEY = "net.ipv4.ip_unprivileged_port_start";
  const TARGET_PORT = 80;

  const currentPort = await getSysctlValue(SYSCTL_KEY);
  const portValue = currentPort ?? 1024;

  if (portValue <= TARGET_PORT) {
    return { status: "skipped", reason: `Already configured (port ${portValue})` };
  }

  log.info(`Setting ${SYSCTL_KEY}=${TARGET_PORT}`);

  if (config.dryRun) {
    log.info(`[DRY-RUN] Would write to ${SYSCTL_FILE}`);
  } else {
    await Bun.write(SYSCTL_FILE, `${SYSCTL_KEY}=${TARGET_PORT}\n`);
    const result = await execute(config.dryRun, log, "sysctl --system");
    if (!result.dryRun && result.exitCode !== 0) {
      return {
        status: "failed",
        error: new CommandFailedError("sysctl --system", result.exitCode, result.stderr),
      };
    }
  }

  return { status: "completed", message: "Unprivileged ports configured" };
}

async function createServiceUser(
  config: RuntimeConfig,
  log: Logger
): Promise<StepResult> {
  const { user, uid } = config.tomlConfig.service;

  if (await userExists(user)) {
    const existingUid = await getUserId(user);
    log.info(`User '${user}' exists (UID: ${existingUid})`);
    return { status: "skipped", reason: `User already exists with UID ${existingUid}` };
  }

  log.info(`Creating user '${user}' (UID: ${uid})`);

  const command = [
    "useradd",
    `--uid ${uid}`,
    "--create-home",
    `--home-dir /home/${user}`,
    "--shell /usr/sbin/nologin",
    `--comment "Caddy Reverse Proxy"`,
    user,
  ].join(" ");

  const result = await execute(config.dryRun, log, command);

  if (!result.dryRun && result.exitCode !== 0) {
    return {
      status: "failed",
      error: new CommandFailedError(command, result.exitCode, result.stderr),
    };
  }

  return { status: "completed", message: "User created" };
}

async function configureSubordinateIds(
  config: RuntimeConfig,
  log: Logger
): Promise<StepResult> {
  const { user, subuid_start, subuid_range } = config.tomlConfig.service;
  const range = subuid_range ?? SUBUID_RANGE_DEFAULT;

  if (await subuidConfigured(user)) {
    return { status: "skipped", reason: "Already configured" };
  }

  const entry = `${user}:${subuid_start}:${range}`;
  log.info(`Adding subuid/subgid range: ${subuid_start}-${subuid_start + range - 1}`);

  if (config.dryRun) {
    log.info("[DRY-RUN] Would add to /etc/subuid and /etc/subgid");
  } else {
    const subuidPath = "/etc/subuid";
    const subgidPath = "/etc/subgid";

    const subuidContent = await Bun.file(subuidPath).text().catch(() => "");
    const subgidContent = await Bun.file(subgidPath).text().catch(() => "");

    await Bun.write(subuidPath, subuidContent + entry + "\n");
    await Bun.write(subgidPath, subgidContent + entry + "\n");
  }

  return { status: "completed", message: "Subordinate IDs configured" };
}

async function createDataDirectories(
  config: RuntimeConfig,
  log: Logger
): Promise<StepResult> {
  const { user } = config.tomlConfig.service;
  const dataDir = config.tomlConfig.paths.data_dir;

  const directories = [dataDir, `${dataDir}/webfiles`];

  for (const dir of directories) {
    if (await directoryExists(dir)) {
      log.debug(`Directory exists: ${dir}`);
    } else {
      const cmd = `install -d -m 750 -o ${user} -g ${user} ${dir}`;
      const result = await execute(config.dryRun, log, cmd);
      if (!result.dryRun && result.exitCode !== 0) {
        return {
          status: "failed",
          error: new CommandFailedError(cmd, result.exitCode, result.stderr),
        };
      }
      log.debug(`Created: ${dir}`);
    }
  }

  return { status: "completed", message: "Data directories ready" };
}

async function generateAndInstallCaddyfile(
  config: RuntimeConfig,
  log: Logger
): Promise<StepResult> {
  const { user } = config.tomlConfig.service;
  const dataDir = config.tomlConfig.paths.data_dir;
  const caddyfilePath = `${dataDir}/Caddyfile`;

  log.info("Generating Caddyfile from TOML configuration");

  const caddyfileContent = generateCaddyfile(config.tomlConfig.caddyfile);

  if (config.dryRun) {
    log.info(`[DRY-RUN] Would write Caddyfile to ${caddyfilePath}`);
    log.debug("Generated Caddyfile:\n" + caddyfileContent);
  } else {
    await Bun.write(caddyfilePath, caddyfileContent);
    await execute(config.dryRun, log, `chown ${user}:${user} ${caddyfilePath}`);
  }

  return { status: "completed", message: "Caddyfile generated and installed" };
}

async function enableLinger(config: RuntimeConfig, log: Logger): Promise<StepResult> {
  const { user } = config.tomlConfig.service;

  if (await isLingerEnabled(user)) {
    return { status: "skipped", reason: "Linger already enabled" };
  }

  const result = await execute(config.dryRun, log, `loginctl enable-linger ${user}`);

  if (!result.dryRun && result.exitCode !== 0) {
    return {
      status: "failed",
      error: new CommandFailedError(
        `loginctl enable-linger ${user}`,
        result.exitCode,
        result.stderr
      ),
    };
  }

  return { status: "completed", message: "Linger enabled" };
}

async function configurePastaNetworking(
  config: RuntimeConfig,
  log: Logger
): Promise<StepResult> {
  const { user } = config.tomlConfig.service;
  const networkMode = config.tomlConfig.container?.network_mode ?? "pasta";
  const configDir = `/home/${user}/.config/containers`;
  const configFile = `${configDir}/containers.conf`;

  await execute(config.dryRun, log, `install -d -m 755 -o ${user} -g ${user} ${configDir}`);

  if (await fileExists(configFile)) {
    try {
      const content = await Bun.file(configFile).text();
      if (content.includes(`default_rootless_network_cmd = "${networkMode}"`)) {
        return { status: "skipped", reason: `${networkMode} networking already configured` };
      }
    } catch {
      // Continue to recreate
    }
  }

  if (config.dryRun) {
    log.info(`[DRY-RUN] Would create ${configFile}`);
  } else {
    const content = `[network]
default_rootless_network_cmd = "${networkMode}"
`;
    await Bun.write(configFile, content);
    await execute(config.dryRun, log, `chown ${user}:${user} ${configFile}`);
  }

  return { status: "completed", message: `${networkMode} networking configured` };
}

async function installQuadletFiles(
  config: RuntimeConfig,
  log: Logger
): Promise<StepResult> {
  const { user, uid } = config.tomlConfig.service;
  const quadletDir = `/home/${user}/.config/containers/systemd`;

  // Create directory hierarchy
  const dirs = [
    `/home/${user}/.config`,
    `/home/${user}/.config/containers`,
    quadletDir,
  ];

  for (const dir of dirs) {
    await execute(config.dryRun, log, `install -d -m 755 -o ${user} -g ${user} ${dir}`);
  }

  // Generate and install quadlet files
  const quadletFiles = [
    { name: "caddy.container", content: generateContainerQuadlet(config.tomlConfig) },
    { name: "caddy-data.volume", content: generateDataVolumeQuadlet() },
    { name: "caddy-config.volume", content: generateConfigVolumeQuadlet() },
  ];

  for (const file of quadletFiles) {
    const dst = `${quadletDir}/${file.name}`;

    if (config.dryRun) {
      log.info(`[DRY-RUN] Would write ${dst}`);
    } else {
      await Bun.write(dst, file.content);
      await execute(config.dryRun, log, `chown ${user}:${user} ${dst}`);
    }
    log.debug(`Installed: ${dst}`);
  }

  // Create runtime directory if needed
  const runtimeDir = `/run/user/${uid}`;
  if (!(await directoryExists(runtimeDir))) {
    await execute(config.dryRun, log, `install -d -m 700 -o ${user} -g ${user} ${runtimeDir}`);
  }

  // Reload systemd
  if (!config.dryRun) {
    const cmd = `sudo -u ${user} XDG_RUNTIME_DIR=${runtimeDir} systemctl --user daemon-reload`;
    const result = await execute(config.dryRun, log, cmd);
    if (result.exitCode !== 0) {
      return {
        status: "failed",
        error: new CommandFailedError(cmd, result.exitCode, result.stderr),
      };
    }
  }

  return { status: "completed", message: "Quadlet files installed" };
}

//═══════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND HANDLERS
//═══════════════════════════════════════════════════════════════════════════════

async function handleValidate(configPath: string, log: Logger): Promise<number> {
  log.info(`Validating configuration: ${configPath}`);

  const result = await loadTomlConfig(configPath);
  if (!result.ok) {
    log.error(result.error.message);
    return ExitCode.ConfigError;
  }

  log.success("Configuration is valid");

  // Show summary
  const config = result.value;
  log.info(`Service user: ${config.service.user} (UID: ${config.service.uid})`);
  log.info(`Data directory: ${config.paths.data_dir}`);
  log.info(`Sites defined: ${config.caddyfile.sites.length}`);
  log.info(`Snippets defined: ${config.caddyfile.snippets?.length ?? 0}`);

  return ExitCode.Success;
}

async function handleGenerate(
  configPath: string,
  outputDir: string,
  log: Logger
): Promise<number> {
  log.info(`Generating files from: ${configPath}`);

  const result = await loadTomlConfig(configPath);
  if (!result.ok) {
    log.error(result.error.message);
    return ExitCode.ConfigError;
  }

  const config = result.value;

  // Ensure output directory exists
  await $`mkdir -p ${outputDir}`.quiet();

  // Generate Caddyfile
  const caddyfileContent = generateCaddyfile(config.caddyfile);
  const caddyfilePath = `${outputDir}/Caddyfile`;
  await Bun.write(caddyfilePath, caddyfileContent);
  log.success(`Generated: ${caddyfilePath}`);

  // Generate quadlet files
  const quadletFiles = [
    { name: "caddy.container", content: generateContainerQuadlet(config) },
    { name: "caddy-data.volume", content: generateDataVolumeQuadlet() },
    { name: "caddy-config.volume", content: generateConfigVolumeQuadlet() },
  ];

  for (const file of quadletFiles) {
    const path = `${outputDir}/${file.name}`;
    await Bun.write(path, file.content);
    log.success(`Generated: ${path}`);
  }

  log.success(`All files generated in: ${outputDir}`);

  return ExitCode.Success;
}

async function handleDiff(
  configPath: string,
  log: Logger,
  verbose: boolean
): Promise<number> {
  const result = await loadTomlConfig(configPath);
  if (!result.ok) {
    log.error(result.error.message);
    return ExitCode.ConfigError;
  }

  const config = result.value;
  const dataDir = config.paths.data_dir;
  const user = config.service.user;
  const quadletDir = `/home/${user}/.config/containers/systemd`;

  // Files to compare
  const filesToCheck = [
    {
      name: "Caddyfile",
      deployed: `${dataDir}/Caddyfile`,
      generated: generateCaddyfile(config.caddyfile),
    },
    {
      name: "caddy.container",
      deployed: `${quadletDir}/caddy.container`,
      generated: generateContainerQuadlet(config),
    },
  ];

  let hasChanges = false;

  for (const file of filesToCheck) {
    const exists = await fileExists(file.deployed);
    if (!exists) {
      log.info(`${file.name}: NEW (would be created)`);
      hasChanges = true;
      if (verbose) {
        console.log(file.generated);
      }
      continue;
    }

    const deployed = await Bun.file(file.deployed).text();
    if (deployed.trim() !== file.generated.trim()) {
      log.warn(`${file.name}: CHANGED`);
      hasChanges = true;

      // Show diff using Bun shell
      const tempFile = `/tmp/caddy-diff-${Date.now()}`;
      await Bun.write(tempFile, file.generated);
      const diffResult = await $`diff -u ${file.deployed} ${tempFile}`.nothrow().quiet();
      if (diffResult.stdout.toString()) {
        console.log(diffResult.stdout.toString());
      }
      await $`rm -f ${tempFile}`.quiet();
    } else {
      log.success(`${file.name}: unchanged`);
    }
  }

  if (!hasChanges) {
    log.success("No changes detected");
  }

  return ExitCode.Success;
}

async function handleSetup(
  configPath: string,
  dryRun: boolean,
  verbose: boolean,
  log: Logger
): Promise<number> {
  // Check root
  if (process.getuid?.() !== 0) {
    throw new RootRequiredError();
  }

  // Load config
  const result = await loadTomlConfig(configPath);
  if (!result.ok) {
    log.error(result.error.message);
    return ExitCode.ConfigError;
  }

  const runtimeConfig: RuntimeConfig = {
    tomlConfig: result.value,
    configPath: configPath as AbsolutePath,
    scriptDir: import.meta.dir as AbsolutePath,
    dryRun,
    verbose,
  };

  // Check dependencies
  const missing: string[] = [];
  for (const cmd of REQUIRED_COMMANDS) {
    if (!Bun.which(cmd)) {
      missing.push(cmd);
    }
  }
  if (missing.length > 0) {
    throw new DependencyMissingError(missing);
  }

  // Execute setup steps
  const steps = [
    { name: "Unprivileged ports", fn: setupUnprivilegedPorts },
    { name: "Service user", fn: createServiceUser },
    { name: "Subordinate IDs", fn: configureSubordinateIds },
    { name: "Data directories", fn: createDataDirectories },
    { name: "Generate Caddyfile", fn: generateAndInstallCaddyfile },
    { name: "User linger", fn: enableLinger },
    { name: "Pasta networking", fn: configurePastaNetworking },
    { name: "Quadlet files", fn: installQuadletFiles },
  ];

  const totalSteps = steps.length;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;

    log.step(i + 1, totalSteps, step.name);

    const stepResult = await step.fn(runtimeConfig, log);

    switch (stepResult.status) {
      case "completed":
        log.success(stepResult.message);
        break;
      case "skipped":
        log.success(stepResult.reason);
        break;
      case "failed":
        log.error(stepResult.error.message);
        return stepResult.error.exitCode;
    }
  }

  // Print summary
  printSetupSummary(runtimeConfig, log);

  return ExitCode.Success;
}

function printSetupSummary(config: RuntimeConfig, log: Logger): void {
  const { user, uid } = config.tomlConfig.service;
  const dataDir = config.tomlConfig.paths.data_dir;
  const c = getColors();
  const runtimeDir = `/run/user/${uid}`;
  const line = "═".repeat(63);

  console.log(`\n${c.bold}${line}${c.reset}`);
  console.log(`${c.green}                    CADDY SETUP COMPLETE${c.reset}`);
  console.log(`${c.bold}${line}${c.reset}`);

  if (config.dryRun) {
    log.warn("DRY-RUN MODE: No changes were made");
  }

  console.log("");
  log.info(`Service User:    ${user} (UID: ${uid})`);
  log.info(`Data Directory:  ${dataDir}`);
  log.info(`Caddyfile:       ${dataDir}/Caddyfile`);
  log.info(`Quadlet Dir:     /home/${user}/.config/containers/systemd`);

  console.log(`\n${c.bold}Next Steps:${c.reset}`);
  console.log("  1. Start service:");
  console.log(
    `     sudo -u ${user} XDG_RUNTIME_DIR=${runtimeDir} systemctl --user start caddy.service\n`
  );
  console.log("  2. Enable auto-start:");
  console.log(
    `     sudo -u ${user} XDG_RUNTIME_DIR=${runtimeDir} systemctl --user enable caddy.service\n`
  );
  console.log("  3. View logs:");
  console.log(
    `     sudo -u ${user} XDG_RUNTIME_DIR=${runtimeDir} journalctl --user -u caddy -f\n`
  );
  console.log("  Or use this script:");
  console.log(`     sudo bun run setup.ts start --config ${config.configPath}\n`);
}

async function handleServiceCommand(
  command: "start" | "stop" | "restart" | "reload" | "status" | "logs",
  configPath: string,
  log: Logger,
  followLogs: boolean = false
): Promise<number> {
  const result = await loadTomlConfig(configPath);
  if (!result.ok) {
    log.error(result.error.message);
    return ExitCode.ConfigError;
  }

  const { user, uid } = result.value.service;
  const runtimeDir = `/run/user/${uid}`;
  const env = `XDG_RUNTIME_DIR=${runtimeDir}`;

  let cmd: string;
  switch (command) {
    case "start":
      cmd = `sudo -u ${user} ${env} systemctl --user start caddy.service`;
      break;
    case "stop":
      cmd = `sudo -u ${user} ${env} systemctl --user stop caddy.service`;
      break;
    case "restart":
      cmd = `sudo -u ${user} ${env} systemctl --user restart caddy.service`;
      break;
    case "reload":
      // Reload Caddy config without restart
      cmd = `sudo -u ${user} ${env} podman exec caddy caddy reload --config /etc/caddy/Caddyfile`;
      break;
    case "status":
      cmd = `sudo -u ${user} ${env} systemctl --user status caddy.service`;
      break;
    case "logs":
      const follow = followLogs ? "-f" : "";
      cmd = `sudo -u ${user} ${env} journalctl --user -u caddy ${follow}`;
      break;
  }

  log.info(`Executing: ${cmd}`);

  // For interactive commands like logs and status, run with inherited stdio
  const proc = Bun.spawn(["sh", "-c", cmd], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;

  if (command === "status" || command === "logs") {
    // These commands may return non-zero for informational reasons
    return ExitCode.Success;
  }

  if (exitCode !== 0) {
    log.error(`Command failed with exit code ${exitCode}`);
    return ExitCode.GeneralError;
  }

  log.success(`${command} completed successfully`);
  return ExitCode.Success;
}

//═══════════════════════════════════════════════════════════════════════════════
// CLI ARGUMENT PARSING
//═══════════════════════════════════════════════════════════════════════════════

function printHelp(): void {
  console.log(`${SCRIPT_NAME} v${SCRIPT_VERSION} - Generic TOML-Based Caddy Configuration Generator

USAGE:
    bun run ${SCRIPT_NAME} <COMMAND> [OPTIONS]

COMMANDS:
    validate    Validate TOML configuration
    generate    Generate Caddyfile and quadlet files
    diff        Show changes compared to deployed files
    setup       Deploy configuration (requires root)
    start       Start the Caddy service
    stop        Stop the Caddy service
    restart     Restart the Caddy service
    reload      Reload Caddy configuration
    status      Show service status
    logs        View service logs

OPTIONS:
    --config, -c PATH    Configuration file path (required)
    --output, -o PATH    Output directory (for generate command)
    --dry-run            Show what would be done
    --verbose, -v        Enable verbose output
    --follow, -f         Follow logs (for logs command)
    --help, -h           Show this help

EXAMPLES:
    # Validate configuration
    bun run ${SCRIPT_NAME} validate -c cloudlab-caddy.toml

    # Generate files to ./out directory
    bun run ${SCRIPT_NAME} generate -c cloudlab-caddy.toml -o ./out

    # Show what would change
    bun run ${SCRIPT_NAME} diff -c cloudlab-caddy.toml

    # Deploy configuration (requires root)
    sudo bun run ${SCRIPT_NAME} setup -c cloudlab-caddy.toml

    # Start and monitor service
    sudo bun run ${SCRIPT_NAME} start -c cloudlab-caddy.toml
    sudo bun run ${SCRIPT_NAME} logs -c cloudlab-caddy.toml -f
`);
}

interface ParsedArgs {
  _: string[];
  config?: string;
  output?: string;
  "dry-run": boolean;
  verbose: boolean;
  follow: boolean;
  help: boolean;
}

function parseArguments(): Result<ParsedArgs, SetupError> {
  try {
    const { values, positionals } = parseArgs({
      args: Bun.argv.slice(2),
      options: {
        config: { type: "string", short: "c" },
        output: { type: "string", short: "o" },
        "dry-run": { type: "boolean", default: false },
        verbose: { type: "boolean", short: "v", default: false },
        follow: { type: "boolean", short: "f", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });

    return Result.ok({
      _: positionals,
      ...values,
    } as ParsedArgs);
  } catch (error) {
    return Result.err(
      new ValidationError(error instanceof Error ? error.message : String(error))
    );
  }
}

//═══════════════════════════════════════════════════════════════════════════════
// MAIN
//═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<never> {
  const argsResult = parseArguments();
  if (!argsResult.ok) {
    console.error(argsResult.error.message);
    process.exit(ExitCode.InvalidArgs);
  }

  const args = argsResult.value;

  if (args.help || args._.length === 0) {
    printHelp();
    process.exit(ExitCode.Success);
  }

  const command = args._[0];
  const log = createLogger(args.verbose);

  // Print banner
  const c = getColors();
  console.log(
    `${c.bold}${c.blue}Caddy Setup v${SCRIPT_VERSION}${c.reset}${args["dry-run"] ? ` ${c.yellow}(DRY-RUN)${c.reset}` : ""}`
  );

  try {
    // Commands that require config
    const configCommands = [
      "validate",
      "generate",
      "diff",
      "setup",
      "start",
      "stop",
      "restart",
      "reload",
      "status",
      "logs",
    ];

    if (configCommands.includes(command ?? "") && !args.config) {
      log.error("--config (-c) is required for this command");
      process.exit(ExitCode.InvalidArgs);
    }

    let exitCode: number;

    switch (command) {
      case "validate":
        exitCode = await handleValidate(args.config!, log);
        break;

      case "generate":
        if (!args.output) {
          log.error("--output (-o) is required for generate command");
          process.exit(ExitCode.InvalidArgs);
        }
        exitCode = await handleGenerate(args.config!, args.output, log);
        break;

      case "diff":
        exitCode = await handleDiff(args.config!, log, args.verbose);
        break;

      case "setup":
        exitCode = await handleSetup(args.config!, args["dry-run"], args.verbose, log);
        break;

      case "start":
      case "stop":
      case "restart":
      case "reload":
      case "status":
        exitCode = await handleServiceCommand(command, args.config!, log);
        break;

      case "logs":
        exitCode = await handleServiceCommand("logs", args.config!, log, args.follow);
        break;

      default:
        log.error(`Unknown command: ${command}`);
        printHelp();
        exitCode = ExitCode.InvalidArgs;
    }

    process.exit(exitCode);
  } catch (error) {
    if (error instanceof SetupError) {
      log.error(error.message);
      process.exit(error.exitCode);
    }

    log.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(ExitCode.GeneralError);
  }
}

if (import.meta.main) {
  await main();
}

//═══════════════════════════════════════════════════════════════════════════════
// EXPORTS (for testing)
//═══════════════════════════════════════════════════════════════════════════════

export {
  // Types
  type TomlConfig,
  type CaddyfileConfig,
  type RuntimeConfig,
  type Directive,
  type Site,
  type Snippet,
  type Matcher,
  type StepResult,
  type CommandResult,
  type UserId,
  type SubordinateId,
  type AbsolutePath,
  type Username,
  // Schemas
  TomlConfigSchema,
  CaddyfileSchema,
  SiteSchema,
  SnippetSchema,
  MatcherSchema,
  DirectiveSchema,
  ServiceSchema,
  PathsSchema,
  ContainerSchema,
  // Constants
  SCRIPT_VERSION,
  ExitCode,
  // Errors
  SetupError,
  RootRequiredError,
  DependencyMissingError,
  CommandFailedError,
  FileNotFoundError,
  ValidationError,
  ConfigError,
  // Functions
  createLogger,
  loadTomlConfig,
  generateCaddyfile,
  generateDirectives,
  generateMatcher,
  generateGlobalOptions,
  generateContainerQuadlet,
  generateDataVolumeQuadlet,
  generateConfigVolumeQuadlet,
  formatArg,
  indent,
};
