/**
 * CLI argument parsing.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { Err, Ok, type Result } from "../lib/result";

/**
 * Available commands.
 */
export const COMMANDS = [
  "validate",
  "generate",
  "diff",
  "setup",
  "start",
  "stop",
  "restart",
  "status",
  "logs",
  "update",
  "backup",
  "restore",
  "reload",
  "help",
] as const;

export type Command = (typeof COMMANDS)[number];

/**
 * Parsed command line arguments.
 */
export interface ParsedArgs {
  /** Service name (e.g., "caddy", "immich", "actual", "all") */
  service: string;
  /** Command to execute */
  command: Command;
  /** Path to configuration file (for validate, generate, diff, setup) */
  configPath?: string;
  /** Output directory (for generate) */
  outputDir?: string;
  /** Backup file path (for restore) */
  backupPath?: string;
  /** Container name (for logs in multi-container services) */
  container?: string;

  // Flags
  /** Show help */
  help: boolean;
  /** Verbose output */
  verbose: boolean;
  /** Dry run mode */
  dryRun: boolean;
  /** Force operation */
  force: boolean;

  // Log options
  /** Follow logs */
  follow: boolean;
  /** Number of log lines */
  lines: number;

  // Log level
  /** Log level */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Output format */
  format: "pretty" | "json";
}

/**
 * Default parsed arguments.
 */
const defaultArgs: ParsedArgs = {
  service: "",
  command: "help",
  help: false,
  verbose: false,
  dryRun: false,
  force: false,
  follow: false,
  lines: 100,
  logLevel: "info",
  format: "pretty",
};

/**
 * Check if a string is a valid command.
 */
export const isCommand = (s: string): s is Command => {
  return COMMANDS.includes(s as Command);
};

/**
 * Parse command line arguments.
 */
export const parseArgs = (argv: string[]): Result<ParsedArgs, DivbanError> => {
  const args: ParsedArgs = { ...defaultArgs };
  const positional: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === undefined) {
      i++;
      continue;
    }

    // Handle flags
    if (arg.startsWith("-")) {
      switch (arg) {
        case "-h":
        case "--help":
          args.help = true;
          break;
        case "-v":
        case "--verbose": {
          args.verbose = true;
          args.logLevel = "debug";
          break;
        }
        case "--dry-run":
          args.dryRun = true;
          break;
        case "-f":
        case "--force":
          args.force = true;
          break;
        case "--follow":
          args.follow = true;
          break;
        case "-n":
        case "--lines": {
          const next = argv[++i];
          if (next !== undefined) {
            const n = Number.parseInt(next, 10);
            if (!Number.isNaN(n) && n > 0) {
              args.lines = n;
            }
          }
          break;
        }
        case "-o":
        case "--output": {
          const next = argv[++i];
          if (next !== undefined) {
            args.outputDir = next;
          }
          break;
        }
        case "-c":
        case "--container": {
          const next = argv[++i];
          if (next !== undefined) {
            args.container = next;
          }
          break;
        }
        case "--log-level": {
          const next = argv[++i];
          if (next !== undefined && ["debug", "info", "warn", "error"].includes(next)) {
            args.logLevel = next as ParsedArgs["logLevel"];
          }
          break;
        }
        case "--format": {
          const next = argv[++i];
          if (next !== undefined && ["pretty", "json"].includes(next)) {
            args.format = next as ParsedArgs["format"];
          }
          break;
        }
        case "--json":
          args.format = "json";
          break;
        default:
          return Err(new DivbanError(ErrorCode.INVALID_ARGS, `Unknown option: ${arg}`));
      }
    } else {
      positional.push(arg);
    }

    i++;
  }

  // Parse positional arguments: <service> <command> [config|backup-path]
  if (positional.length === 0) {
    args.help = true;
    return Ok(args);
  }

  // First positional: service name
  args.service = positional[0] ?? "";

  // Second positional: command
  if (positional.length >= 2) {
    const cmd = positional[1];
    if (cmd !== undefined && isCommand(cmd)) {
      args.command = cmd;
    } else if (cmd !== undefined) {
      return Err(
        new DivbanError(
          ErrorCode.INVALID_ARGS,
          `Unknown command: ${cmd}. Available commands: ${COMMANDS.join(", ")}`
        )
      );
    }
  } else {
    // Default to status if only service provided
    args.command = "status";
  }

  // Third positional: config path or backup path
  if (positional.length >= 3) {
    const third = positional[2];
    if (third !== undefined) {
      if (args.command === "restore") {
        args.backupPath = third;
      } else {
        args.configPath = third;
      }
    }
  }

  return Ok(args);
};

/**
 * Validate parsed arguments for a specific command.
 */
export const validateArgs = (args: ParsedArgs): Result<void, DivbanError> => {
  // Service is always required (except for help)
  if (!(args.help || args.service)) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        "Service name is required. Usage: divban <service> <command>"
      )
    );
  }

  // Commands that require config path
  const configRequired = ["validate", "generate", "diff", "setup"];
  if (configRequired.includes(args.command) && !args.configPath) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        `Config path is required for '${args.command}' command. Usage: divban ${args.service} ${args.command} <config-path>`
      )
    );
  }

  // Restore requires backup path
  if (args.command === "restore" && !args.backupPath) {
    return Err(
      new DivbanError(
        ErrorCode.INVALID_ARGS,
        "Backup path is required for 'restore' command. Usage: divban <service> restore <backup-path>"
      )
    );
  }

  return Ok(undefined);
};
