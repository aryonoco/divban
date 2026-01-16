#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
//═══════════════════════════════════════════════════════════════════════════════
// setup.ts - Caddy Reverse Proxy Rootless Podman Setup
//
// DESCRIPTION:
//   Installs Caddy as a rootless Podman quadlet with dedicated service user.
//   Configures unprivileged port binding for ports 80/443.
//   Non-interactive and idempotent.
//
// REQUIREMENTS:
//   Bun 1.0+
//   Podman 4.4+ (5.0+ recommended)
//   systemd with user lingering support
//
// USAGE:
//   sudo bun run setup.ts
//   sudo bun run setup.ts --dry-run --verbose
//   sudo bun run setup.ts --uid 1100 --subuid-start 100000
//
// OPTIONS:
//   --uid UID            Service user UID (default: 1100)
//   --subuid-start NUM   Starting subordinate UID (default: 100000)
//   --dry-run            Show what would be done without making changes
//   --verbose, -v        Enable verbose output
//   --help, -h           Show this help message
//
// ENVIRONMENT:
//   CADDY_UID            Override default UID
//   CADDY_SUBUID_START   Override default subordinate UID start
//
// LICENSE: MIT
//═══════════════════════════════════════════════════════════════════════════════

import { $ } from "bun";
import { parseArgs } from "util";
import { z } from "zod";

//═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
//═══════════════════════════════════════════════════════════════════════════════

// Branded types for nominal typing - prevents mixing different semantic values
type UserId = number & { readonly __brand: "UserId" };
type SubordinateId = number & { readonly __brand: "SubordinateId" };
type AbsolutePath = string & { readonly __brand: "AbsolutePath" };
type Username = string & { readonly __brand: "Username" };

// Result type for operations that can fail predictably
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
// ZOD SCHEMAS
//═══════════════════════════════════════════════════════════════════════════════

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

const ConfigSchema = z.object({
  serviceUser: UsernameSchema,
  uid: UserIdSchema,
  subUidStart: SubordinateIdSchema,
  dataDir: AbsolutePathSchema,
  scriptDir: AbsolutePathSchema,
  dryRun: z.boolean(),
  verbose: z.boolean(),
});

type Config = z.infer<typeof ConfigSchema>;

//═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
//═══════════════════════════════════════════════════════════════════════════════

const SCRIPT_NAME = "setup.ts";
const SCRIPT_VERSION = "1.0.0";

const DEFAULT_UID = 1100;
const DEFAULT_SUBUID_START = 100000;
const SUBUID_RANGE = 65536;

const SERVICE_USER = "caddy" as Username;
const DATA_DIR = "/srv/caddy" as AbsolutePath;

const QUADLET_FILES = [
  "caddy.container",
  "caddy-data.volume",
  "caddy-config.volume",
] as const;

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
  "grep",
  "sysctl",
  "tee",
  "openssl",
] as const;

const ExitCode = {
  Success: 0,
  GeneralError: 1,
  InvalidArgs: 2,
  RootRequired: 3,
  DependencyMissing: 4,
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
    super("This script must be run as root", "RootRequired");
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

//═══════════════════════════════════════════════════════════════════════════════
// LOGGING
//═══════════════════════════════════════════════════════════════════════════════

// ANSI color codes
const COLORS = {
  red: "\x1b[0;31m",
  green: "\x1b[0;32m",
  yellow: "\x1b[0;33m",
  blue: "\x1b[0;34m",
  cyan: "\x1b[0;36m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
} as const;

// Get colors based on TTY support
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

// Logger factory
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
      console.log(
        `\n${c.bold}${c.blue}[Step ${num}/${total}]${c.reset} ${desc}`
      );
    },
  };
}

type Logger = ReturnType<typeof createLogger>;

//═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
//═══════════════════════════════════════════════════════════════════════════════

// Result helpers
const Result = {
  ok: <T>(value: T): Result<T, never> => ({ ok: true, value }),
  err: <E>(error: E): Result<never, E> => ({ ok: false, error }),
};

// Shell execution wrapper with dry-run support
async function execute(
  config: Config,
  log: Logger,
  command: string
): Promise<CommandResult> {
  if (config.dryRun) {
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
    // Use Bun Shell with nothrow to capture exit codes
    const result = await $`sh -c ${command}`.nothrow().quiet();
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      command,
      dryRun: false,
    };
  } catch (error) {
    // Should not reach here with nothrow(), but handle just in case
    return {
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      command,
      dryRun: false,
    };
  }
}

// Check if user exists
async function userExists(username: Username): Promise<boolean> {
  const result = await $`getent passwd ${username}`.nothrow().quiet();
  return result.exitCode === 0;
}

// Get user's UID
async function getUserId(username: Username): Promise<number | null> {
  const result = await $`id -u ${username}`.nothrow().quiet();
  if (result.exitCode !== 0) return null;
  const uid = parseInt(result.stdout.toString().trim(), 10);
  return isNaN(uid) ? null : uid;
}

// Check if subuid is configured for user
async function subuidConfigured(username: Username): Promise<boolean> {
  try {
    const content = await Bun.file("/etc/subuid").text();
    return content.includes(`${username}:`);
  } catch {
    return false;
  }
}

// Check if linger is enabled for user
async function isLingerEnabled(username: Username): Promise<boolean> {
  const result = await $`loginctl show-user ${username} -p Linger`.nothrow().quiet();
  if (result.exitCode !== 0) return false;
  return result.stdout.toString().includes("Linger=yes");
}

// Get sysctl value
async function getSysctlValue(key: string): Promise<number | null> {
  const result = await $`sysctl -n ${key}`.nothrow().quiet();
  if (result.exitCode !== 0) return null;
  const value = parseInt(result.stdout.toString().trim(), 10);
  return isNaN(value) ? null : value;
}

// Check if file exists
async function fileExists(path: AbsolutePath): Promise<boolean> {
  return Bun.file(path).exists();
}

// Check if directory exists
async function directoryExists(path: AbsolutePath): Promise<boolean> {
  try {
    const result = await $`test -d ${path}`.nothrow().quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

//═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
//═══════════════════════════════════════════════════════════════════════════════

function checkRoot(): void {
  if (process.getuid?.() !== 0) {
    throw new RootRequiredError();
  }
}

async function checkDependencies(log: Logger): Promise<void> {
  log.info("Checking dependencies...");

  const missing: string[] = [];
  for (const cmd of REQUIRED_COMMANDS) {
    const path = Bun.which(cmd);
    if (!path) {
      missing.push(cmd);
    }
  }

  if (missing.length > 0) {
    throw new DependencyMissingError(missing);
  }

  // Check Podman version
  const result = await $`podman --version`.nothrow().quiet();
  if (result.exitCode === 0) {
    const versionMatch = result.stdout.toString().match(/(\d+\.\d+)/);
    if (versionMatch?.[1]) {
      log.debug(`Podman version: ${versionMatch[1]}`);
    }
  }

  log.success("All dependencies available");
}

//═══════════════════════════════════════════════════════════════════════════════
// SETUP STEPS
//═══════════════════════════════════════════════════════════════════════════════

// Step 1: Configure unprivileged port binding
async function setupUnprivilegedPorts(
  config: Config,
  log: Logger
): Promise<StepResult> {
  const SYSCTL_FILE = "/etc/sysctl.d/99-unprivileged-ports.conf" as AbsolutePath;
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
    const result = await execute(config, log, "sysctl --system");
    if (!result.dryRun && result.exitCode !== 0) {
      return {
        status: "failed",
        error: new CommandFailedError("sysctl --system", result.exitCode, result.stderr),
      };
    }
  }

  return { status: "completed", message: "Unprivileged ports configured" };
}

// Step 2: Create service user
async function createServiceUser(
  config: Config,
  log: Logger
): Promise<StepResult> {
  const { serviceUser, uid } = config;

  if (await userExists(serviceUser)) {
    const existingUid = await getUserId(serviceUser);
    log.info(`User '${serviceUser}' exists (UID: ${existingUid})`);
    return { status: "skipped", reason: `User already exists with UID ${existingUid}` };
  }

  log.info(`Creating user '${serviceUser}' (UID: ${uid})`);

  const command = [
    "useradd",
    `--uid ${uid}`,
    "--create-home",
    `--home-dir /home/${serviceUser}`,
    "--shell /usr/sbin/nologin",
    `--comment "Caddy Reverse Proxy"`,
    serviceUser,
  ].join(" ");

  const result = await execute(config, log, command);

  if (!result.dryRun && result.exitCode !== 0) {
    return {
      status: "failed",
      error: new CommandFailedError(command, result.exitCode, result.stderr),
    };
  }

  return { status: "completed", message: "User created" };
}

// Step 3: Configure subordinate IDs
async function configureSubordinateIds(
  config: Config,
  log: Logger
): Promise<StepResult> {
  const { serviceUser, subUidStart } = config;

  if (await subuidConfigured(serviceUser)) {
    return { status: "skipped", reason: "Already configured" };
  }

  const entry = `${serviceUser}:${subUidStart}:${SUBUID_RANGE}`;
  log.info(
    `Adding subuid/subgid range: ${subUidStart}-${subUidStart + SUBUID_RANGE - 1}`
  );

  if (config.dryRun) {
    log.info("[DRY-RUN] Would add to /etc/subuid and /etc/subgid");
  } else {
    // Append to both files
    const subuidPath = "/etc/subuid";
    const subgidPath = "/etc/subgid";

    const subuidContent = await Bun.file(subuidPath).text().catch(() => "");
    const subgidContent = await Bun.file(subgidPath).text().catch(() => "");

    await Bun.write(subuidPath, subuidContent + entry + "\n");
    await Bun.write(subgidPath, subgidContent + entry + "\n");
  }

  return { status: "completed", message: "Subordinate IDs configured" };
}

// Step 4: Create data directories
async function createDataDirectories(
  config: Config,
  log: Logger
): Promise<StepResult> {
  const { dataDir, serviceUser, scriptDir } = config;

  const directories = [
    dataDir,
    `${dataDir}/data` as AbsolutePath,
    `${dataDir}/config` as AbsolutePath,
    `${dataDir}/webfiles` as AbsolutePath,
    `${dataDir}/webfiles/americoffee` as AbsolutePath,
  ];

  for (const dir of directories) {
    if (await directoryExists(dir)) {
      log.debug(`Directory exists: ${dir}`);
    } else {
      const cmd = `install -d -m 750 -o ${serviceUser} -g ${serviceUser} ${dir}`;
      const result = await execute(config, log, cmd);
      if (!result.dryRun && result.exitCode !== 0) {
        return {
          status: "failed",
          error: new CommandFailedError(cmd, result.exitCode, result.stderr),
        };
      }
      log.debug(`Created: ${dir}`);
    }
  }

  // Install Caddyfile
  const caddyfileDst = `${dataDir}/Caddyfile` as AbsolutePath;
  const caddyfileSrc = `${scriptDir}/Caddyfile` as AbsolutePath;

  if (await fileExists(caddyfileDst)) {
    log.info("Caddyfile exists (not overwriting)");
  } else {
    log.info("Installing default Caddyfile");
    await execute(config, log, `cp ${caddyfileSrc} ${caddyfileDst}`);
    await execute(config, log, `chown ${serviceUser}:${serviceUser} ${caddyfileDst}`);
  }

  return { status: "completed", message: "Data directories ready" };
}

// Step 5: Enable user linger
async function enableLinger(config: Config, log: Logger): Promise<StepResult> {
  const { serviceUser } = config;

  if (await isLingerEnabled(serviceUser)) {
    return { status: "skipped", reason: "Linger already enabled" };
  }

  const result = await execute(config, log, `loginctl enable-linger ${serviceUser}`);

  if (!result.dryRun && result.exitCode !== 0) {
    return {
      status: "failed",
      error: new CommandFailedError(
        `loginctl enable-linger ${serviceUser}`,
        result.exitCode,
        result.stderr
      ),
    };
  }

  return { status: "completed", message: "Linger enabled" };
}

// Step 6: Configure pasta networking
async function configurePastaNetworking(
  config: Config,
  log: Logger
): Promise<StepResult> {
  const { serviceUser } = config;
  const configDir = `/home/${serviceUser}/.config/containers` as AbsolutePath;
  const configFile = `${configDir}/containers.conf` as AbsolutePath;

  // Ensure directory exists
  await execute(
    config,
    log,
    `install -d -m 755 -o ${serviceUser} -g ${serviceUser} ${configDir}`
  );

  // Check if already configured
  if (await fileExists(configFile)) {
    try {
      const content = await Bun.file(configFile).text();
      if (content.includes('default_rootless_network_cmd = "pasta"')) {
        return { status: "skipped", reason: "Pasta networking already configured" };
      }
    } catch {
      // File exists but couldn't read - continue to recreate
    }
    log.info("containers.conf exists (checking pasta config)");
  }

  if (config.dryRun) {
    log.info(`[DRY-RUN] Would create ${configFile}`);
  } else {
    const content = `[network]
default_rootless_network_cmd = "pasta"
`;
    await Bun.write(configFile, content);
    await execute(config, log, `chown ${serviceUser}:${serviceUser} ${configFile}`);
  }

  return { status: "completed", message: "Pasta networking configured" };
}

// Step 7: Install quadlet files
async function installQuadletFiles(
  config: Config,
  log: Logger
): Promise<StepResult> {
  const { serviceUser, uid, scriptDir } = config;
  const quadletDir =
    `/home/${serviceUser}/.config/containers/systemd` as AbsolutePath;

  // Create directory hierarchy
  const dirs = [
    `/home/${serviceUser}/.config` as AbsolutePath,
    `/home/${serviceUser}/.config/containers` as AbsolutePath,
    quadletDir,
  ];

  for (const dir of dirs) {
    await execute(
      config,
      log,
      `install -d -m 755 -o ${serviceUser} -g ${serviceUser} ${dir}`
    );
  }

  // Install quadlet files
  for (const file of QUADLET_FILES) {
    const src = `${scriptDir}/${file}` as AbsolutePath;
    const dst = `${quadletDir}/${file}` as AbsolutePath;

    if (!(await fileExists(src))) {
      return {
        status: "failed",
        error: new FileNotFoundError(src),
      };
    }

    await execute(config, log, `cp ${src} ${dst}`);
    await execute(config, log, `chown ${serviceUser}:${serviceUser} ${dst}`);
    log.debug(`Installed: ${dst}`);
  }

  // Create runtime directory if needed
  const runtimeDir = `/run/user/${uid}` as AbsolutePath;
  if (!(await directoryExists(runtimeDir))) {
    await execute(
      config,
      log,
      `install -d -m 700 -o ${serviceUser} -g ${serviceUser} ${runtimeDir}`
    );
  }

  // Reload systemd
  if (!config.dryRun) {
    const cmd = `sudo -u ${serviceUser} XDG_RUNTIME_DIR=${runtimeDir} systemctl --user daemon-reload`;
    const result = await execute(config, log, cmd);
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
// OUTPUT
//═══════════════════════════════════════════════════════════════════════════════

function printBanner(config: Config, log: Logger): void {
  const c = getColors();
  const line = "═".repeat(63);

  console.log(`${c.bold}${line}${c.reset}`);
  console.log(
    `${c.blue}  Caddy Reverse Proxy - Rootless Podman Setup v${SCRIPT_VERSION}${c.reset}`
  );
  console.log(`${c.bold}${line}${c.reset}`);

  if (config.dryRun) {
    log.warn("DRY-RUN MODE: No changes will be made");
  }
}

function printSummary(config: Config, log: Logger): void {
  const { serviceUser, uid, dataDir } = config;
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
  log.info(`Service User:    ${serviceUser} (UID: ${uid})`);
  log.info(`Home Directory:  /home/${serviceUser}`);
  log.info(`Data Directory:  ${dataDir}`);
  log.info(`Caddyfile:       ${dataDir}/Caddyfile`);
  log.info(`Quadlet Dir:     /home/${serviceUser}/.config/containers/systemd`);

  console.log(`\n${c.bold}Next Steps:${c.reset}`);
  console.log("  1. Edit Caddyfile:");
  console.log(`     sudo nano ${dataDir}/Caddyfile\n`);
  console.log("  2. Start service:");
  console.log(
    `     sudo -u ${serviceUser} XDG_RUNTIME_DIR=${runtimeDir} systemctl --user start caddy.service\n`
  );
  console.log("  3. Enable auto-start:");
  console.log(
    `     sudo -u ${serviceUser} XDG_RUNTIME_DIR=${runtimeDir} systemctl --user enable caddy.service\n`
  );
  console.log("  4. View logs:");
  console.log(
    `     sudo -u ${serviceUser} XDG_RUNTIME_DIR=${runtimeDir} journalctl --user -u caddy -f\n`
  );
}

function printHelp(): void {
  console.log(`${SCRIPT_NAME} v${SCRIPT_VERSION} - Caddy Rootless Podman Setup

USAGE:
    sudo bun run ${SCRIPT_NAME} [OPTIONS]

OPTIONS:
    --uid UID            Service user UID (default: ${DEFAULT_UID})
    --subuid-start NUM   Starting subordinate UID (default: ${DEFAULT_SUBUID_START})
    --dry-run            Show what would be done
    --verbose, -v        Enable verbose output
    --help, -h           Show this help

EXAMPLES:
    sudo bun run ${SCRIPT_NAME}
    sudo bun run ${SCRIPT_NAME} --dry-run --verbose
    sudo bun run ${SCRIPT_NAME} --uid 1100 --subuid-start 100000
`);
}

//═══════════════════════════════════════════════════════════════════════════════
// ARGUMENT PARSING
//═══════════════════════════════════════════════════════════════════════════════

interface ParsedArgs {
  uid?: string;
  "subuid-start"?: string;
  "dry-run": boolean;
  verbose: boolean;
  help: boolean;
}

function parseArguments(): Result<ParsedArgs, SetupError> {
  try {
    const { values } = parseArgs({
      args: Bun.argv.slice(2),
      options: {
        uid: { type: "string" },
        "subuid-start": { type: "string" },
        "dry-run": { type: "boolean", default: false },
        verbose: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    });

    return Result.ok(values as ParsedArgs);
  } catch (error) {
    return Result.err(
      new ValidationError(
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}

function buildConfig(args: ParsedArgs): Result<Config, SetupError> {
  // Get values from environment or args
  const envUid = Bun.env["CADDY_UID"];
  const envSubUid = Bun.env["CADDY_SUBUID_START"];

  const uidValue = args.uid
    ? parseInt(args.uid, 10)
    : envUid
      ? parseInt(envUid, 10)
      : DEFAULT_UID;

  const subUidValue = args["subuid-start"]
    ? parseInt(args["subuid-start"], 10)
    : envSubUid
      ? parseInt(envSubUid, 10)
      : DEFAULT_SUBUID_START;

  // Validate with Zod
  const result = ConfigSchema.safeParse({
    serviceUser: SERVICE_USER,
    uid: uidValue,
    subUidStart: subUidValue,
    dataDir: DATA_DIR,
    scriptDir: import.meta.dir,
    dryRun: args["dry-run"],
    verbose: args.verbose,
  });

  if (!result.success) {
    return Result.err(
      new ValidationError(
        `Invalid configuration: ${result.error.issues.map((i) => i.message).join(", ")}`,
        result.error
      )
    );
  }

  return Result.ok(result.data);
}

//═══════════════════════════════════════════════════════════════════════════════
// MAIN
//═══════════════════════════════════════════════════════════════════════════════

// Setup step definitions
const SETUP_STEPS = [
  { name: "Unprivileged ports", fn: setupUnprivilegedPorts },
  { name: "Service user", fn: createServiceUser },
  { name: "Subordinate IDs", fn: configureSubordinateIds },
  { name: "Data directories", fn: createDataDirectories },
  { name: "User linger", fn: enableLinger },
  { name: "Pasta networking", fn: configurePastaNetworking },
  { name: "Quadlet files", fn: installQuadletFiles },
] as const;

async function main(): Promise<never> {
  // Parse arguments
  const argsResult = parseArguments();
  if (!argsResult.ok) {
    console.error(argsResult.error.message);
    process.exit(ExitCode.InvalidArgs);
  }

  const args = argsResult.value;

  // Show help if requested
  if (args.help) {
    printHelp();
    process.exit(ExitCode.Success);
  }

  // Build configuration
  const configResult = buildConfig(args);
  if (!configResult.ok) {
    console.error(configResult.error.message);
    process.exit(configResult.error.exitCode);
  }

  const config = configResult.value;
  const log = createLogger(config.verbose);

  // Print banner
  printBanner(config, log);

  try {
    // Pre-flight checks
    checkRoot();
    await checkDependencies(log);

    // Execute setup steps
    const totalSteps = SETUP_STEPS.length;
    for (let i = 0; i < SETUP_STEPS.length; i++) {
      const step = SETUP_STEPS[i];
      if (!step) continue;

      log.step(i + 1, totalSteps, step.name);

      const result = await step.fn(config, log);

      switch (result.status) {
        case "completed":
          log.success(result.message);
          break;
        case "skipped":
          log.success(result.reason);
          break;
        case "failed":
          log.error(result.error.message);
          process.exit(result.error.exitCode);
      }
    }

    // Print summary
    printSummary(config, log);
    log.success("Setup completed successfully");
    process.exit(ExitCode.Success);
  } catch (error) {
    if (error instanceof SetupError) {
      log.error(error.message);
      process.exit(error.exitCode);
    }

    // Unexpected error
    log.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(ExitCode.GeneralError);
  }
}

// Run main only when executed directly (not when imported for testing)
if (import.meta.main) {
  await main();
}

//═══════════════════════════════════════════════════════════════════════════════
// EXPORTS (for testing)
//═══════════════════════════════════════════════════════════════════════════════

export {
  // Types
  type Config,
  type StepResult,
  type CommandResult,
  type UserId,
  type SubordinateId,
  type AbsolutePath,
  type Username,
  // Schemas
  ConfigSchema,
  UserIdSchema,
  SubordinateIdSchema,
  AbsolutePathSchema,
  UsernameSchema,
  // Constants
  SCRIPT_VERSION,
  DEFAULT_UID,
  DEFAULT_SUBUID_START,
  SUBUID_RANGE,
  SERVICE_USER,
  DATA_DIR,
  QUADLET_FILES,
  REQUIRED_COMMANDS,
  ExitCode,
  // Errors
  SetupError,
  RootRequiredError,
  DependencyMissingError,
  CommandFailedError,
  FileNotFoundError,
  ValidationError,
  // Functions
  createLogger,
  parseArguments,
  buildConfig,
  userExists,
  getUserId,
  subuidConfigured,
  isLingerEnabled,
  getSysctlValue,
  fileExists,
  directoryExists,
  // Steps (for testing)
  setupUnprivilegedPorts,
  createServiceUser,
  configureSubordinateIds,
  createDataDirectories,
  enableLinger,
  configurePastaNetworking,
  installQuadletFiles,
};
