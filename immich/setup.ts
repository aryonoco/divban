#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
//═══════════════════════════════════════════════════════════════════════════════
// setup.ts - Generic TOML-Based Immich Configuration Generator for Rootless Podman
//
// DESCRIPTION:
//   A completely generic Immich configuration system where:
//   - TOML can express any valid Immich configuration
//   - Users can define containers, volumes, networks, hardware acceleration
//   - Generator produces correct Quadlet files for rootless Podman
//   - Supports all official Immich environment variables
//
// REQUIREMENTS:
//   Bun 1.0+
//   Podman 4.4+ (5.0+ recommended)
//   systemd with user lingering support
//
// USAGE:
//   bun run setup.ts validate -c cloudlab-immich.toml
//   bun run setup.ts generate -c cloudlab-immich.toml -o /tmp/immich-out
//   sudo bun run setup.ts setup -c cloudlab-immich.toml
//   sudo bun run setup.ts start -c cloudlab-immich.toml
//   sudo bun run setup.ts status -c cloudlab-immich.toml
//   sudo bun run setup.ts logs -c cloudlab-immich.toml
//   sudo bun run setup.ts backup -c cloudlab-immich.toml -o /backup
//   sudo bun run setup.ts restore -c cloudlab-immich.toml --dump /backup/immich-db.sql.gz
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

// Generated file output
interface GeneratedFile {
  path: string;
  content: string;
}

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
// Service Configuration Schema
//───────────────────────────────────────────────────────────────────────────────

const ServiceSchema = z.object({
  user: UsernameSchema,
  uid: UserIdSchema,
  subuid_start: SubordinateIdSchema,
  subuid_range: z.number().int().positive().default(65536),
});

const PathsSchema = z.object({
  data_dir: AbsolutePathSchema,
  upload_location: AbsolutePathSchema,
  db_data_location: AbsolutePathSchema,
});

//───────────────────────────────────────────────────────────────────────────────
// Network Configuration Schema
//───────────────────────────────────────────────────────────────────────────────

const NetworkSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  driver: z.enum(["bridge", "host", "none"]).default("bridge"),
  internal: z.boolean().default(true),
});

//───────────────────────────────────────────────────────────────────────────────
// Volume Configuration Schema
//───────────────────────────────────────────────────────────────────────────────

const VolumeSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

//───────────────────────────────────────────────────────────────────────────────
// External Library Schema
//───────────────────────────────────────────────────────────────────────────────

const ExternalLibrarySchema = z.object({
  host_path: AbsolutePathSchema,
  container_path: z.string(),
  read_only: z.boolean().default(true),
});

//───────────────────────────────────────────────────────────────────────────────
// Hardware Acceleration Schemas
//───────────────────────────────────────────────────────────────────────────────

const TranscodingBackend = z.enum(["nvenc", "qsv", "rkmpp", "vaapi", "vaapi-wsl"]);
const MLBackend = z.enum(["cuda", "openvino", "openvino-wsl", "armnn", "rknn", "rocm"]);

const TranscodingHardwareSchema = z.object({
  backend: TranscodingBackend,
  devices: z.array(z.string()).optional(),
  enable_hdr_tonemapping: z.boolean().optional(),
});

const MLHardwareSchema = z.object({
  backend: MLBackend,
  device_ids: z.array(z.string()).default(["0"]),
});

const HardwareSchema = z.object({
  transcoding: TranscodingHardwareSchema.optional(),
  machine_learning: MLHardwareSchema.optional(),
});

//───────────────────────────────────────────────────────────────────────────────
// Container Configuration Schema
//───────────────────────────────────────────────────────────────────────────────

const PortSchema = z.object({
  host_ip: z.string().optional(),
  host: z.number().int().min(1).max(65535),
  container: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});

const VolumeMountSchema = z.object({
  source: z.string(),
  target: z.string(),
  options: z.string().optional(),
});

const HealthCheckSchema = z.object({
  cmd: z.string(),
  interval: z.string().default("30s"),
  timeout: z.string().default("10s"),
  retries: z.number().int().positive().default(3),
  start_period: z.string().optional(),
  on_failure: z.enum(["none", "kill", "stop", "restart"]).optional(),
});

const UserNsSchema = z.object({
  mode: z.enum(["keep-id", "auto", "host"]),
  uid: z.number().int().optional(),
  gid: z.number().int().optional(),
});

const ServiceOptionsSchema = z.object({
  restart: z.enum(["no", "always", "on-failure", "unless-stopped"]).default("on-failure"),
  restart_sec: z.number().int().positive().default(10),
  timeout_start_sec: z.number().int().positive().optional(),
  timeout_stop_sec: z.number().int().positive().optional(),
});

const ContainerSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  image: z.string(),
  image_digest: z.string().optional(),
  requires: z.array(z.string()).default([]),
  wants: z.array(z.string()).default([]),
  env_groups: z.array(z.string()).default([]),
  ports: z.array(PortSchema).default([]),
  volumes: z.array(VolumeMountSchema).default([]),
  devices: z.array(z.string()).optional(),
  health: HealthCheckSchema.optional(),
  user_ns: UserNsSchema.optional(),
  shm_size: z.string().optional(),
  read_only_rootfs: z.boolean().optional(),
  no_new_privileges: z.boolean().default(true),
  auto_update: z.enum(["registry", "local"]).optional(),
  start_limit_burst: z.number().int().positive().optional(),
  start_limit_interval_sec: z.number().int().positive().optional(),
  security_options: z.array(z.string()).optional(),
  group_add: z.array(z.string()).optional(),
  environment: z.record(z.string()).optional(),
  service: ServiceOptionsSchema.optional(),
});

//───────────────────────────────────────────────────────────────────────────────
// Secrets Schema
//───────────────────────────────────────────────────────────────────────────────

const SecretsSchema = z.record(z.string()).optional();

//───────────────────────────────────────────────────────────────────────────────
// Complete Configuration Schema
//───────────────────────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  service: ServiceSchema,
  paths: PathsSchema,
  network: NetworkSchema,
  environment: z.record(z.record(z.union([z.string(), z.number(), z.boolean()]))),
  secrets: SecretsSchema,
  volumes: z.array(VolumeSchema).default([]),
  external_libraries: z.array(ExternalLibrarySchema).default([]),
  hardware: HardwareSchema.optional(),
  containers: z.array(ContainerSchema),
});

type Config = z.infer<typeof ConfigSchema>;
type Container = z.infer<typeof ContainerSchema>;
type Volume = z.infer<typeof VolumeSchema>;
type Hardware = z.infer<typeof HardwareSchema>;

//───────────────────────────────────────────────────────────────────────────────
// Runtime Configuration Schema
//───────────────────────────────────────────────────────────────────────────────

const RuntimeConfigSchema = z.object({
  tomlConfig: ConfigSchema,
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
const SCRIPT_VERSION = "1.0.0";

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
// HARDWARE ACCELERATION MAPPINGS
//═══════════════════════════════════════════════════════════════════════════════

// Device mappings by backend type (from official hwaccel.*.yml files)
const TRANSCODING_DEVICES: Record<string, string[]> = {
  nvenc: [], // Uses GPU reservation instead of device mounts
  qsv: ["/dev/dri:/dev/dri"],
  vaapi: ["/dev/dri:/dev/dri"],
  "vaapi-wsl": ["/dev/dri:/dev/dri", "/dev/dxg:/dev/dxg"],
  rkmpp: [
    "/dev/dri:/dev/dri",
    "/dev/rga:/dev/rga",
    "/dev/dma_heap:/dev/dma_heap",
    "/dev/mpp_service:/dev/mpp_service",
  ],
};

const ML_DEVICES: Record<string, string[]> = {
  cuda: [], // Uses GPU reservation instead of device mounts
  openvino: ["/dev/dri:/dev/dri"],
  "openvino-wsl": ["/dev/dri:/dev/dri", "/dev/dxg:/dev/dxg"],
  armnn: ["/dev/mali0:/dev/mali0"],
  rknn: ["/dev/dri:/dev/dri"],
  rocm: ["/dev/kfd:/dev/kfd", "/dev/dri:/dev/dri"],
};

// Additional volumes needed for some backends
const BACKEND_VOLUMES: Record<string, string[]> = {
  "vaapi-wsl": ["/usr/lib/wsl:/usr/lib/wsl:ro"],
  armnn: [
    "/lib/firmware/mali_csffw.bin:/lib/firmware/mali_csffw.bin:ro",
    "/usr/lib/libmali.so:/usr/lib/libmali.so:ro",
  ],
  "openvino-wsl": ["/usr/lib/wsl:/usr/lib/wsl:ro"],
  rkmpp: ["/etc/OpenCL:/etc/OpenCL:ro"],
};

// Environment variables for specific backends
const BACKEND_ENV: Record<string, Record<string, string>> = {
  "vaapi-wsl": { LIBVA_DRIVER_NAME: "d3d12" },
};

// Security options for RKMPP/RKNN (required for device access)
const SECURITY_OPTIONS: Record<string, string[]> = {
  rkmpp: ["systempaths=unconfined", "apparmor=unconfined"],
  rknn: ["systempaths=unconfined", "apparmor=unconfined"],
};

// Image suffix by ML backend
const ML_IMAGE_SUFFIX: Record<string, string> = {
  cuda: "-cuda",
  openvino: "-openvino",
  armnn: "-armnn",
  rknn: "-rknn",
  rocm: "-cuda", // ROCm uses CUDA image with ROCm runtime
};

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

async function loadTomlConfig(configPath: string): Promise<Result<Config, SetupError>> {
  try {
    if (!(await fileExists(configPath))) {
      return Result.err(new FileNotFoundError(configPath));
    }

    // Read and parse TOML using smol-toml
    const content = await Bun.file(configPath).text();
    const raw = TOML.parse(content);
    const parsed = ConfigSchema.safeParse(raw);

    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n  ");
      return Result.err(new ConfigError(`Invalid configuration:\n  ${issues}`));
    }

    return Result.ok(parsed.data);
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
// HARDWARE ACCELERATION HELPERS
//═══════════════════════════════════════════════════════════════════════════════

function getDevicesForContainer(
  containerName: string,
  hardware: Hardware | undefined
): string[] {
  if (!hardware) return [];
  const devices: string[] = [];

  // Transcoding devices go to immich-server
  if (containerName === "immich-server" && hardware.transcoding) {
    const backend = hardware.transcoding.backend;
    devices.push(...(hardware.transcoding.devices ?? TRANSCODING_DEVICES[backend] ?? []));
  }

  // ML devices go to immich-machine-learning
  if (containerName === "immich-machine-learning" && hardware.machine_learning) {
    const backend = hardware.machine_learning.backend;
    devices.push(...(ML_DEVICES[backend] ?? []));
  }

  return [...new Set(devices)]; // Deduplicate
}

function getMLImageWithSuffix(baseImage: string, hardware: Hardware | undefined): string {
  if (!hardware?.machine_learning) return baseImage;
  const suffix = ML_IMAGE_SUFFIX[hardware.machine_learning.backend] ?? "";
  // Insert suffix before :tag e.g., "image:v1.124.2" -> "image:v1.124.2-cuda"
  const colonIndex = baseImage.lastIndexOf(":");
  if (colonIndex === -1) return `${baseImage}${suffix}`;
  return `${baseImage.substring(0, colonIndex)}${suffix}${baseImage.substring(colonIndex)}`;
}

function getBackendConfig(containerName: string, hardware: Hardware | undefined) {
  const config = {
    volumes: [] as string[],
    env: {} as Record<string, string>,
    security: [] as string[],
    groups: [] as string[],
  };
  if (!hardware) return config;

  // Transcoding backends (for immich-server)
  if (containerName === "immich-server" && hardware.transcoding) {
    const backend = hardware.transcoding.backend;
    config.volumes.push(...(BACKEND_VOLUMES[backend] ?? []));
    Object.assign(config.env, BACKEND_ENV[backend] ?? {});
    config.security.push(...(SECURITY_OPTIONS[backend] ?? []));
  }

  // ML backends (for immich-machine-learning)
  if (containerName === "immich-machine-learning" && hardware.machine_learning) {
    const backend = hardware.machine_learning.backend;
    config.volumes.push(...(BACKEND_VOLUMES[backend] ?? []));
    config.security.push(...(SECURITY_OPTIONS[backend] ?? []));
    // ROCm needs video group access
    if (backend === "rocm") config.groups.push("video");
  }

  return config;
}

//═══════════════════════════════════════════════════════════════════════════════
// EXTERNAL LIBRARY HANDLING
//═══════════════════════════════════════════════════════════════════════════════

function getExternalLibraryVolumes(
  containerName: string,
  externalLibraries: z.infer<typeof ExternalLibrarySchema>[]
): z.infer<typeof VolumeMountSchema>[] {
  // Only immich-server needs external library mounts
  if (containerName !== "immich-server") return [];

  return externalLibraries.map((lib) => ({
    source: lib.host_path,
    target: lib.container_path,
    options: lib.read_only ? "ro" : undefined,
  }));
}

//═══════════════════════════════════════════════════════════════════════════════
// VARIABLE SUBSTITUTION
//═══════════════════════════════════════════════════════════════════════════════

function substituteVariables(value: string, config: Config): string {
  return value
    .replace(/\$\{UPLOAD_LOCATION\}/g, config.paths.upload_location)
    .replace(/\$\{DB_DATA_LOCATION\}/g, config.paths.db_data_location)
    .replace(/\$\{DATA_DIR\}/g, config.paths.data_dir)
    .replace(/\$\{DB_USERNAME\}/g, String(config.environment["database"]?.["DB_USERNAME"] ?? "immich"))
    .replace(/\$\{DB_DATABASE_NAME\}/g, String(config.environment["database"]?.["DB_DATABASE_NAME"] ?? "immich"));
}

//═══════════════════════════════════════════════════════════════════════════════
// QUADLET FILE GENERATORS
//═══════════════════════════════════════════════════════════════════════════════

function generateNetworkQuadlet(config: Config): GeneratedFile {
  const { network } = config;
  const lines: string[] = [];

  lines.push("[Unit]");
  lines.push(`Description=${network.description ?? `${network.name} Network`}`);
  lines.push("");

  lines.push("[Network]");
  lines.push(`NetworkName=${network.name}`);
  lines.push(`Driver=${network.driver}`);
  if (network.internal) {
    lines.push("Internal=true");
  }
  lines.push("");

  lines.push("[Install]");
  lines.push("WantedBy=default.target");
  lines.push("");

  return { path: "immich.network", content: lines.join("\n") };
}

function generateVolumeQuadlet(vol: Volume): GeneratedFile {
  const lines: string[] = [];

  lines.push("[Unit]");
  lines.push(`Description=${vol.description ?? vol.name}`);
  lines.push("");

  lines.push("[Volume]");
  lines.push(`VolumeName=${vol.name}`);
  lines.push("");

  lines.push("[Install]");
  lines.push("WantedBy=default.target");
  lines.push("");

  return { path: `${vol.name}.volume`, content: lines.join("\n") };
}

function buildDependencies(container: Container, _config: Config) {
  const afterDeps: string[] = ["immich-network.service"];
  const requiresDeps: string[] = ["immich-network.service"];
  const wantsDeps: string[] = [];

  // Add volume dependencies from container volumes
  for (const vol of container.volumes) {
    if (vol.source.endsWith(".volume")) {
      const volService = vol.source.replace(".volume", "-volume.service");
      afterDeps.push(volService);
      requiresDeps.push(volService);
    }
  }

  // Add container dependencies
  for (const dep of container.requires) {
    afterDeps.push(`${dep}.service`);
    requiresDeps.push(`${dep}.service`);
  }

  for (const dep of container.wants) {
    afterDeps.push(`${dep}.service`);
    wantsDeps.push(`${dep}.service`);
  }

  return {
    after: afterDeps.join(" "),
    requires: requiresDeps.join(" "),
    wants: wantsDeps.length > 0 ? wantsDeps.join(" ") : undefined,
  };
}

function formatUserNs(userNs: z.infer<typeof UserNsSchema>): string {
  let result = userNs.mode;
  const parts: string[] = [];
  if (userNs.uid !== undefined) parts.push(`uid=${userNs.uid}`);
  if (userNs.gid !== undefined) parts.push(`gid=${userNs.gid}`);
  if (parts.length > 0) {
    result += `:${parts.join(",")}`;
  }
  return result;
}

function generateContainerQuadlet(container: Container, config: Config): GeneratedFile {
  const deps = buildDependencies(container, config);
  const envFile = `\${HOME}/.config/containers/systemd/immich.env`;

  // Get backend-specific configuration
  const backendConfig = getBackendConfig(container.name, config.hardware);

  // Collect all volumes including external libraries and backend-specific
  const allVolumes = [
    ...container.volumes.map((v) => ({
      source: substituteVariables(v.source, config),
      target: v.target,
      options: v.options,
    })),
    ...getExternalLibraryVolumes(container.name, config.external_libraries),
    ...backendConfig.volumes.map((v) => {
      const parts = v.split(":");
      return {
        source: parts[0] ?? "",
        target: parts[1] ?? "",
        options: parts[2],
      };
    }),
  ];

  // Get devices for hardware acceleration
  const devices = [
    ...(container.devices ?? []),
    ...getDevicesForContainer(container.name, config.hardware),
  ];

  // Merge security options
  const securityOptions = [...(container.security_options ?? []), ...backendConfig.security];

  // Merge group_add
  const groups = [...(container.group_add ?? []), ...backendConfig.groups];

  // Merge container-specific env with backend env
  const containerEnv = { ...backendConfig.env, ...(container.environment ?? {}) };

  // Adjust ML image for GPU backend
  let image = container.image;
  if (container.name === "immich-machine-learning") {
    image = getMLImageWithSuffix(image, config.hardware);
  }

  // Add image digest if specified
  if (container.image_digest) {
    image = `${image}@${container.image_digest}`;
  }

  const lines: string[] = [];

  // [Unit] section
  lines.push("[Unit]");
  lines.push(`Description=${container.description ?? container.name}`);
  if (deps.after) lines.push(`After=${deps.after}`);
  if (deps.requires) lines.push(`Requires=${deps.requires}`);
  if (deps.wants) lines.push(`Wants=${deps.wants}`);
  if (container.start_limit_burst) lines.push(`StartLimitBurst=${container.start_limit_burst}`);
  if (container.start_limit_interval_sec)
    lines.push(`StartLimitIntervalSec=${container.start_limit_interval_sec}`);
  lines.push("");

  // [Container] section
  lines.push("[Container]");
  lines.push(`ContainerName=${container.name}`);
  lines.push(`HostName=${container.name}`);
  lines.push("");
  lines.push(`Image=${image}`);
  if (container.auto_update) lines.push(`AutoUpdate=${container.auto_update}`);
  lines.push("");
  // Reference the network quadlet file (immich.network), not the network name
  lines.push("Network=immich.network");

  // Ports
  if (container.ports.length > 0) {
    lines.push("");
    for (const p of container.ports) {
      const proto = p.protocol === "udp" ? "/udp" : "";
      const hostIp = p.host_ip ? `${p.host_ip}:` : "";
      lines.push(`PublishPort=${hostIp}${p.host}:${p.container}${proto}`);
    }
  }

  // Environment file (only if container has env_groups)
  if (container.env_groups.length > 0) {
    lines.push("");
    lines.push(`EnvironmentFile=${envFile}`);
  }

  // Container-specific environment variables
  if (Object.keys(containerEnv).length > 0) {
    for (const [key, value] of Object.entries(containerEnv)) {
      lines.push(`Environment=${key}=${value}`);
    }
  }

  // Volumes
  if (allVolumes.length > 0) {
    lines.push("");
    for (const v of allVolumes) {
      const opts = v.options ? `:${v.options}` : ":";
      lines.push(`Volume=${v.source}:${v.target}${opts}`);
    }
  }

  // Devices
  if (devices.length > 0) {
    lines.push("");
    for (const d of devices) {
      lines.push(`AddDevice=${d}`);
    }
  }

  // Security options
  if (securityOptions.length > 0) {
    for (const s of securityOptions) {
      lines.push(`SecurityLabelType=${s}`);
    }
  }

  // Group add
  if (groups.length > 0) {
    for (const g of groups) {
      lines.push(`GroupAdd=${g}`);
    }
  }

  // User namespace
  if (container.user_ns) {
    lines.push("");
    lines.push(`UserNS=${formatUserNs(container.user_ns)}`);
  }

  // Shared memory size
  if (container.shm_size) {
    lines.push("");
    lines.push(`ShmSize=${container.shm_size}`);
  }

  // Health check
  if (container.health) {
    const health = container.health;
    lines.push("");
    lines.push(`HealthCmd=${substituteVariables(health.cmd, config)}`);
    lines.push(`HealthInterval=${health.interval}`);
    lines.push(`HealthTimeout=${health.timeout}`);
    lines.push(`HealthRetries=${health.retries}`);
    if (health.start_period) lines.push(`HealthStartPeriod=${health.start_period}`);
    lines.push("Notify=healthy");
    if (health.on_failure) lines.push(`HealthOnFailure=${health.on_failure}`);
  }

  // Security
  lines.push("");
  lines.push(`NoNewPrivileges=${container.no_new_privileges}`);
  if (container.read_only_rootfs) lines.push("ReadOnlyRootfs=true");
  lines.push("LogDriver=journald");

  // [Service] section
  lines.push("");
  lines.push("[Service]");
  const service = container.service ?? { restart: "on-failure", restart_sec: 10 };
  lines.push(`Restart=${service.restart}`);
  lines.push(`RestartSec=${service.restart_sec}`);
  if (service.timeout_start_sec) lines.push(`TimeoutStartSec=${service.timeout_start_sec}`);
  if (service.timeout_stop_sec) lines.push(`TimeoutStopSec=${service.timeout_stop_sec}`);

  // [Install] section
  lines.push("");
  lines.push("[Install]");
  lines.push("WantedBy=default.target");
  lines.push("");

  return { path: `${container.name}.container`, content: lines.join("\n") };
}

function generateEnvFile(config: Config): GeneratedFile {
  const lines: string[] = [
    "# Generated by setup.ts - DO NOT EDIT MANUALLY",
    "# Location: ~/.config/containers/systemd/immich.env",
  ];

  for (const [group, vars] of Object.entries(config.environment)) {
    lines.push("");
    lines.push(`# ${group}`);
    for (const [key, value] of Object.entries(vars)) {
      lines.push(`${key}=${value}`);
    }
  }

  return { path: "immich.env", content: lines.join("\n") + "\n" };
}

function generateAllFiles(config: Config): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Network
  files.push(generateNetworkQuadlet(config));

  // Volumes
  for (const vol of config.volumes) {
    files.push(generateVolumeQuadlet(vol));
  }

  // Containers
  for (const container of config.containers) {
    files.push(generateContainerQuadlet(container, config));
  }

  // Environment file
  files.push(generateEnvFile(config));

  return files;
}

//═══════════════════════════════════════════════════════════════════════════════
// SETUP STEPS
//═══════════════════════════════════════════════════════════════════════════════

async function createServiceUser(rtConfig: RuntimeConfig, log: Logger): Promise<StepResult> {
  const { user, uid } = rtConfig.tomlConfig.service;

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
    `--comment "Immich Photo Manager"`,
    user,
  ].join(" ");

  const result = await execute(rtConfig.dryRun, log, command);

  if (!result.dryRun && result.exitCode !== 0) {
    return {
      status: "failed",
      error: new CommandFailedError(command, result.exitCode, result.stderr),
    };
  }

  return { status: "completed", message: "User created" };
}

async function configureSubordinateIds(
  rtConfig: RuntimeConfig,
  log: Logger
): Promise<StepResult> {
  const { user, subuid_start, subuid_range } = rtConfig.tomlConfig.service;
  const range = subuid_range ?? SUBUID_RANGE_DEFAULT;

  if (await subuidConfigured(user)) {
    return { status: "skipped", reason: "Already configured" };
  }

  const entry = `${user}:${subuid_start}:${range}`;
  log.info(`Adding subuid/subgid range: ${subuid_start}-${subuid_start + range - 1}`);

  if (rtConfig.dryRun) {
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
  rtConfig: RuntimeConfig,
  log: Logger
): Promise<StepResult> {
  const { user } = rtConfig.tomlConfig.service;
  const { data_dir, upload_location, db_data_location } = rtConfig.tomlConfig.paths;

  const directories = [data_dir, upload_location, db_data_location];

  for (const dir of directories) {
    if (await directoryExists(dir)) {
      log.debug(`Directory exists: ${dir}`);
    } else {
      const cmd = `install -d -m 750 -o ${user} -g ${user} ${dir}`;
      const result = await execute(rtConfig.dryRun, log, cmd);
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

async function enableLinger(rtConfig: RuntimeConfig, log: Logger): Promise<StepResult> {
  const { user } = rtConfig.tomlConfig.service;

  if (await isLingerEnabled(user)) {
    return { status: "skipped", reason: "Linger already enabled" };
  }

  const result = await execute(rtConfig.dryRun, log, `loginctl enable-linger ${user}`);

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

async function configureContainersConf(
  rtConfig: RuntimeConfig,
  log: Logger
): Promise<StepResult> {
  const { user } = rtConfig.tomlConfig.service;
  const configDir = `/home/${user}/.config/containers`;
  const configFile = `${configDir}/containers.conf`;

  await execute(rtConfig.dryRun, log, `install -d -m 755 -o ${user} -g ${user} ${configDir}`);

  if (await fileExists(configFile)) {
    return { status: "skipped", reason: "containers.conf already exists" };
  }

  if (rtConfig.dryRun) {
    log.info(`[DRY-RUN] Would create ${configFile}`);
  } else {
    const content = `[containers]
log_driver = "journald"
`;
    await Bun.write(configFile, content);
    await execute(rtConfig.dryRun, log, `chown ${user}:${user} ${configFile}`);
  }

  return { status: "completed", message: "containers.conf configured" };
}

async function installEnvFile(rtConfig: RuntimeConfig, log: Logger): Promise<StepResult> {
  const { user } = rtConfig.tomlConfig.service;
  const quadletDir = `/home/${user}/.config/containers/systemd`;
  const envFile = generateEnvFile(rtConfig.config);
  const envPath = `${quadletDir}/${envFile.path}`;

  if (rtConfig.dryRun) {
    log.info(`[DRY-RUN] Would write ${envPath}`);
  } else {
    await Bun.write(envPath, envFile.content);
    await execute(rtConfig.dryRun, log, `chmod 600 ${envPath}`);
    await execute(rtConfig.dryRun, log, `chown ${user}:${user} ${envPath}`);
  }

  return { status: "completed", message: "Environment file installed" };
}

async function installQuadletFiles(rtConfig: RuntimeConfig, log: Logger): Promise<StepResult> {
  const { user, uid } = rtConfig.tomlConfig.service;
  const quadletDir = `/home/${user}/.config/containers/systemd`;

  // Create directory hierarchy
  const dirs = [
    `/home/${user}/.config`,
    `/home/${user}/.config/containers`,
    quadletDir,
  ];

  for (const dir of dirs) {
    await execute(rtConfig.dryRun, log, `install -d -m 755 -o ${user} -g ${user} ${dir}`);
  }

  // Generate and install quadlet files
  const files = generateAllFiles(rtConfig.config).filter((f) => f.path !== "immich.env");

  for (const file of files) {
    const dst = `${quadletDir}/${file.path}`;

    if (rtConfig.dryRun) {
      log.info(`[DRY-RUN] Would write ${dst}`);
    } else {
      await Bun.write(dst, file.content);
      await execute(rtConfig.dryRun, log, `chown ${user}:${user} ${dst}`);
    }
    log.debug(`Installed: ${dst}`);
  }

  // Create runtime directory if needed
  const runtimeDir = `/run/user/${uid}`;
  if (!(await directoryExists(runtimeDir))) {
    await execute(rtConfig.dryRun, log, `install -d -m 700 -o ${user} -g ${user} ${runtimeDir}`);
  }

  return { status: "completed", message: "Quadlet files installed" };
}

async function reloadSystemd(rtConfig: RuntimeConfig, log: Logger): Promise<StepResult> {
  const { user, uid } = rtConfig.tomlConfig.service;
  const runtimeDir = `/run/user/${uid}`;

  if (!rtConfig.dryRun) {
    const cmd = `sudo -u ${user} XDG_RUNTIME_DIR=${runtimeDir} systemctl --user daemon-reload`;
    const result = await execute(rtConfig.dryRun, log, cmd);
    if (result.exitCode !== 0) {
      return {
        status: "failed",
        error: new CommandFailedError(cmd, result.exitCode, result.stderr),
      };
    }
  }

  return { status: "completed", message: "Systemd reloaded" };
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
  log.info(`Containers: ${config.containers.length}`);
  log.info(`Volumes: ${config.volumes.length}`);
  log.info(`Network: ${config.network.name}`);
  if (config.hardware?.transcoding) {
    log.info(`Transcoding: ${config.hardware.transcoding.backend}`);
  }
  if (config.hardware?.machine_learning) {
    log.info(`ML Acceleration: ${config.hardware.machine_learning.backend}`);
  }

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

  // Generate all files
  const files = generateAllFiles(config);

  for (const file of files) {
    const path = `${outputDir}/${file.path}`;
    await Bun.write(path, file.content);
    log.success(`Generated: ${path}`);
  }

  log.success(`All files generated in: ${outputDir}`);

  return ExitCode.Success;
}

async function handleDiff(configPath: string, log: Logger, verbose: boolean): Promise<number> {
  const result = await loadTomlConfig(configPath);
  if (!result.ok) {
    log.error(result.error.message);
    return ExitCode.ConfigError;
  }

  const config = result.value;
  const user = config.service.user;
  const quadletDir = `/home/${user}/.config/containers/systemd`;

  // Generate all files and compare
  const files = generateAllFiles(config);
  let hasChanges = false;

  for (const file of files) {
    const deployedPath = `${quadletDir}/${file.path}`;
    const exists = await fileExists(deployedPath);

    if (!exists) {
      log.info(`${file.path}: NEW (would be created)`);
      hasChanges = true;
      if (verbose) {
        console.log(file.content);
      }
      continue;
    }

    const deployed = await Bun.file(deployedPath).text();
    if (deployed.trim() !== file.content.trim()) {
      log.warn(`${file.path}: CHANGED`);
      hasChanges = true;

      // Show diff using Bun shell
      const tempFile = `/tmp/immich-diff-${Date.now()}`;
      await Bun.write(tempFile, file.content);
      const diffResult = await $`diff -u ${deployedPath} ${tempFile}`.nothrow().quiet();
      if (diffResult.stdout.toString()) {
        console.log(diffResult.stdout.toString());
      }
      await $`rm -f ${tempFile}`.quiet();
    } else {
      log.success(`${file.path}: unchanged`);
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

  const rtConfig: RuntimeConfig = {
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
    { name: "Create service user", fn: createServiceUser },
    { name: "Configure subordinate IDs", fn: configureSubordinateIds },
    { name: "Create data directories", fn: createDataDirectories },
    { name: "Enable user linger", fn: enableLinger },
    { name: "Configure containers.conf", fn: configureContainersConf },
    { name: "Install environment file", fn: installEnvFile },
    { name: "Install quadlet files", fn: installQuadletFiles },
    { name: "Reload systemd", fn: reloadSystemd },
  ];

  const totalSteps = steps.length;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;

    log.step(i + 1, totalSteps, step.name);

    const stepResult = await step.fn(rtConfig, log);

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
  printSetupSummary(rtConfig, log);

  return ExitCode.Success;
}

function printSetupSummary(rtConfig: RuntimeConfig, log: Logger): void {
  const { user, uid } = rtConfig.tomlConfig.service;
  const c = getColors();
  const runtimeDir = `/run/user/${uid}`;
  const line = "=".repeat(63);

  console.log(`\n${c.bold}${line}${c.reset}`);
  console.log(`${c.green}                    IMMICH SETUP COMPLETE${c.reset}`);
  console.log(`${c.bold}${line}${c.reset}`);

  if (rtConfig.dryRun) {
    log.warn("DRY-RUN MODE: No changes were made");
  }

  console.log("");
  log.info(`Service User:    ${user} (UID: ${uid})`);
  log.info(`Data Directory:  ${rtConfig.tomlConfig.paths.data_dir}`);
  log.info(`Upload Location: ${rtConfig.tomlConfig.paths.upload_location}`);
  log.info(`DB Location:     ${rtConfig.tomlConfig.paths.db_data_location}`);
  log.info(`Quadlet Dir:     /home/${user}/.config/containers/systemd`);

  console.log(`\n${c.bold}Next Steps:${c.reset}`);
  console.log("  1. Start all services:");
  console.log(`     sudo bun run setup.ts start -c ${rtConfig.configPath}\n`);
  console.log("  2. Enable auto-start:");
  console.log(
    `     sudo -u ${user} XDG_RUNTIME_DIR=${runtimeDir} systemctl --user enable immich-server.service\n`
  );
  console.log("  3. View logs:");
  console.log(`     sudo bun run setup.ts logs -c ${rtConfig.configPath} -f\n`);
  console.log(`  4. Access Immich at: http://localhost:2283\n`);
}

async function handleServiceCommand(
  command: "start" | "stop" | "restart" | "status" | "logs",
  configPath: string,
  log: Logger,
  options: { follow?: boolean; container?: string } = {}
): Promise<number> {
  const result = await loadTomlConfig(configPath);
  if (!result.ok) {
    log.error(result.error.message);
    return ExitCode.ConfigError;
  }

  const { user, uid } = result.value.service;
  const runtimeDir = `/run/user/${uid}`;
  const env = `XDG_RUNTIME_DIR=${runtimeDir}`;

  // Determine services to operate on
  let services: string[];
  if (options.container) {
    services = [`${options.container}.service`];
  } else {
    // Order matters for start/stop
    services = result.value.containers.map((c) => `${c.name}.service`);
    if (command === "stop") {
      services.reverse(); // Stop in reverse order
    }
  }

  let cmd: string;
  switch (command) {
    case "start":
      cmd = `sudo -u ${user} ${env} systemctl --user start ${services.join(" ")}`;
      break;
    case "stop":
      cmd = `sudo -u ${user} ${env} systemctl --user stop ${services.join(" ")}`;
      break;
    case "restart":
      cmd = `sudo -u ${user} ${env} systemctl --user restart ${services.join(" ")}`;
      break;
    case "status":
      cmd = `sudo -u ${user} ${env} systemctl --user status ${services.join(" ")}`;
      break;
    case "logs": {
      const follow = options.follow ? "-f" : "";
      const units = services.map((s) => `-u ${s}`).join(" ");
      cmd = `sudo -u ${user} ${env} journalctl --user ${units} ${follow}`;
      break;
    }
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

async function handleBackup(
  configPath: string,
  outputPath: string,
  log: Logger
): Promise<number> {
  const result = await loadTomlConfig(configPath);
  if (!result.ok) {
    log.error(result.error.message);
    return ExitCode.ConfigError;
  }

  const { user, uid } = result.value.service;
  const runtimeDir = `/run/user/${uid}`;
  const env = `XDG_RUNTIME_DIR=${runtimeDir}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpFile = `${outputPath}/immich-db-${timestamp}.sql.gz`;

  // Ensure output directory exists
  await $`mkdir -p ${outputPath}`.quiet();

  log.info("Stopping immich-server and immich-machine-learning...");
  await $`sudo -u ${user} ${env} systemctl --user stop immich-server immich-machine-learning`.nothrow().quiet();

  log.info(`Dumping database to ${dumpFile}...`);
  const pgUser = result.value.environment["postgres"]?.["POSTGRES_USER"] ?? "immich";
  const dumpCmd = `sudo -u ${user} ${env} podman exec immich-postgres pg_dumpall --clean --if-exists --username=${pgUser} | gzip > ${dumpFile}`;

  const dumpResult = await $`sh -c ${dumpCmd}`.nothrow().quiet();

  log.info("Restarting services...");
  await $`sudo -u ${user} ${env} systemctl --user start immich-server immich-machine-learning`.nothrow().quiet();

  if (dumpResult.exitCode !== 0) {
    log.error(`Backup failed: ${dumpResult.stderr.toString()}`);
    return ExitCode.GeneralError;
  }

  log.success(`Database backed up to: ${dumpFile}`);
  log.warn(`IMPORTANT: Also backup your upload location: ${result.value.paths.upload_location}`);

  return ExitCode.Success;
}

async function handleRestore(
  configPath: string,
  dumpFile: string,
  log: Logger
): Promise<number> {
  const result = await loadTomlConfig(configPath);
  if (!result.ok) {
    log.error(result.error.message);
    return ExitCode.ConfigError;
  }

  if (!(await fileExists(dumpFile))) {
    log.error(`Dump file not found: ${dumpFile}`);
    return ExitCode.GeneralError;
  }

  const { user, uid } = result.value.service;
  const runtimeDir = `/run/user/${uid}`;
  const env = `XDG_RUNTIME_DIR=${runtimeDir}`;

  log.info("Stopping immich-server and immich-machine-learning...");
  await $`sudo -u ${user} ${env} systemctl --user stop immich-server immich-machine-learning`.nothrow().quiet();

  log.warn("IMPORTANT: Set DB_SKIP_MIGRATIONS=true in immich.env before restore");

  log.info(`Restoring database from ${dumpFile}...`);
  const pgUser = result.value.environment["postgres"]?.["POSTGRES_USER"] ?? "immich";
  const restoreCmd = `gunzip -c ${dumpFile} | sudo -u ${user} ${env} podman exec -i immich-postgres psql --username=${pgUser}`;

  const restoreResult = await $`sh -c ${restoreCmd}`.nothrow().quiet();

  if (restoreResult.exitCode !== 0) {
    log.error(`Restore failed: ${restoreResult.stderr.toString()}`);
    return ExitCode.GeneralError;
  }

  log.success("Database restored successfully");
  console.log("\nNext steps:");
  console.log(`  1. Start immich-server: sudo bun run setup.ts start -c ${configPath}`);
  console.log("  2. Run migrations via Admin UI or API");
  console.log("  3. Remove DB_SKIP_MIGRATIONS from immich.env");

  return ExitCode.Success;
}

//═══════════════════════════════════════════════════════════════════════════════
// CLI ARGUMENT PARSING
//═══════════════════════════════════════════════════════════════════════════════

function printHelp(): void {
  console.log(`${SCRIPT_NAME} v${SCRIPT_VERSION} - Generic TOML-Based Immich Configuration Generator

USAGE:
    bun run ${SCRIPT_NAME} <COMMAND> [OPTIONS]

COMMANDS:
    validate    Validate TOML configuration
    generate    Generate quadlet files to directory
    diff        Show changes compared to deployed files
    setup       Deploy configuration (requires root)
    start       Start Immich services
    stop        Stop Immich services
    restart     Restart Immich services
    status      Show service status
    logs        View service logs
    backup      Backup database
    restore     Restore database from backup

OPTIONS:
    --config, -c PATH      Configuration file path (required)
    --output, -o PATH      Output directory (for generate/backup)
    --dump PATH            Dump file path (for restore)
    --dry-run              Show what would be done
    --verbose, -v          Enable verbose output
    --follow, -f           Follow logs (for logs command)
    --container NAME       Target specific container
    --help, -h             Show this help

EXAMPLES:
    # Validate configuration
    bun run ${SCRIPT_NAME} validate -c cloudlab-immich.toml

    # Generate files to /tmp/immich-out
    bun run ${SCRIPT_NAME} generate -c cloudlab-immich.toml -o /tmp/immich-out

    # Show what would change
    bun run ${SCRIPT_NAME} diff -c cloudlab-immich.toml

    # Deploy configuration (requires root)
    sudo bun run ${SCRIPT_NAME} setup -c cloudlab-immich.toml

    # Start all services
    sudo bun run ${SCRIPT_NAME} start -c cloudlab-immich.toml

    # View logs with follow
    sudo bun run ${SCRIPT_NAME} logs -c cloudlab-immich.toml -f

    # Backup database
    sudo bun run ${SCRIPT_NAME} backup -c cloudlab-immich.toml -o /backup

    # Restore database
    sudo bun run ${SCRIPT_NAME} restore -c cloudlab-immich.toml --dump /backup/immich-db.sql.gz
`);
}

interface ParsedArgs {
  _: string[];
  config?: string;
  output?: string;
  dump?: string;
  "dry-run": boolean;
  verbose: boolean;
  follow: boolean;
  container?: string;
  help: boolean;
}

function parseArguments(): Result<ParsedArgs, SetupError> {
  try {
    const { values, positionals } = parseArgs({
      args: Bun.argv.slice(2),
      options: {
        config: { type: "string", short: "c" },
        output: { type: "string", short: "o" },
        dump: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        verbose: { type: "boolean", short: "v", default: false },
        follow: { type: "boolean", short: "f", default: false },
        container: { type: "string" },
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
    `${c.bold}${c.blue}Immich Setup v${SCRIPT_VERSION}${c.reset}${args["dry-run"] ? ` ${c.yellow}(DRY-RUN)${c.reset}` : ""}`
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
      "status",
      "logs",
      "backup",
      "restore",
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
      case "status":
        exitCode = await handleServiceCommand(command, args.config!, log,
          args.container ? { container: args.container } : {}
        );
        break;

      case "logs":
        exitCode = await handleServiceCommand("logs", args.config!, log, {
          follow: args.follow,
          ...(args.container ? { container: args.container } : {}),
        });
        break;

      case "backup":
        if (!args.output) {
          log.error("--output (-o) is required for backup command");
          process.exit(ExitCode.InvalidArgs);
        }
        exitCode = await handleBackup(args.config!, args.output, log);
        break;

      case "restore":
        if (!args.dump) {
          log.error("--dump is required for restore command");
          process.exit(ExitCode.InvalidArgs);
        }
        exitCode = await handleRestore(args.config!, args.dump, log);
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
  type Config,
  type Container,
  type Volume,
  type Hardware,
  type RuntimeConfig,
  type StepResult,
  type CommandResult,
  type GeneratedFile,
  type UserId,
  type SubordinateId,
  type AbsolutePath,
  type Username,
  // Schemas
  ConfigSchema,
  ServiceSchema,
  PathsSchema,
  NetworkSchema,
  VolumeSchema,
  ContainerSchema,
  HealthCheckSchema,
  HardwareSchema,
  ExternalLibrarySchema,
  // Constants
  SCRIPT_VERSION,
  ExitCode,
  TRANSCODING_DEVICES,
  ML_DEVICES,
  ML_IMAGE_SUFFIX,
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
  generateNetworkQuadlet,
  generateVolumeQuadlet,
  generateContainerQuadlet,
  generateEnvFile,
  generateAllFiles,
  getDevicesForContainer,
  getMLImageWithSuffix,
  getBackendConfig,
  getExternalLibraryVolumes,
  substituteVariables,
  formatUserNs,
};
