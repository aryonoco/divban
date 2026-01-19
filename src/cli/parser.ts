// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * CLI argument parsing using Node.js util.parseArgs.
 */

import { parseArgs as nodeParseArgs } from "node:util";
import { DivbanError, ErrorCode } from "../lib/errors";
import { Err, Ok, type Result } from "../lib/result";

/**
 * Available commands.
 */
export const COMMANDS: readonly string[] = [
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
  "backup-config",
  "restore",
  "reload",
  "remove",
  "secret",
  "help",
] as const satisfies readonly string[];

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
  /** Subcommand (for secret: show, list) */
  subcommand?: string;
  /** Secret name (for secret show) */
  secretName?: string;

  // Flags
  /** Show help */
  help: boolean;
  /** Show version */
  version: boolean;
  /** Verbose output */
  verbose: boolean;
  /** Dry run mode */
  dryRun: boolean;
  /** Force operation */
  force: boolean;
  /** Preserve data directories (for remove) */
  preserveData: boolean;

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
  version: false,
  verbose: false,
  dryRun: false,
  force: false,
  preserveData: false,
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
 * Parse command line arguments using Node.js util.parseArgs.
 */
export const parseArgs = (argv: string[]): Result<ParsedArgs, DivbanError> => {
  const args: ParsedArgs = { ...defaultArgs };

  try {
    const { values, positionals } = nodeParseArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "V" },
        verbose: { type: "boolean", short: "v" },
        "dry-run": { type: "boolean" },
        force: { type: "boolean", short: "f" },
        "preserve-data": { type: "boolean" },
        follow: { type: "boolean" },
        lines: { type: "string", short: "n" },
        output: { type: "string", short: "o" },
        container: { type: "string", short: "c" },
        "log-level": { type: "string" },
        format: { type: "string" },
        json: { type: "boolean" },
      },
      allowPositionals: true,
      strict: true,
    });

    // Apply parsed flags
    if (values.help) {
      args.help = true;
    }
    if (values.version) {
      args.version = true;
    }
    if (values.verbose) {
      args.verbose = true;
      args.logLevel = "debug";
    }
    if (values["dry-run"]) {
      args.dryRun = true;
    }
    if (values.force) {
      args.force = true;
    }
    if (values["preserve-data"]) {
      args.preserveData = true;
    }
    if (values.follow) {
      args.follow = true;
    }
    if (values.json) {
      args.format = "json";
    }

    // Apply parsed options with values
    if (values.lines !== undefined) {
      const n = Number.parseInt(values.lines, 10);
      if (!Number.isNaN(n) && n > 0) {
        args.lines = n;
      }
    }
    if (values.output !== undefined) {
      args.outputDir = values.output;
    }
    if (values.container !== undefined) {
      args.container = values.container;
    }
    if (
      values["log-level"] !== undefined &&
      ["debug", "info", "warn", "error"].includes(values["log-level"])
    ) {
      args.logLevel = values["log-level"] as ParsedArgs["logLevel"];
    }
    if (values.format !== undefined && ["pretty", "json"].includes(values.format)) {
      args.format = values.format as ParsedArgs["format"];
    }

    // Parse positional arguments: <service> <command> [config|backup-path]
    if (positionals.length === 0) {
      args.help = true;
      return Ok(args);
    }

    // First positional: service name
    args.service = positionals[0] ?? "";

    // Second positional: command
    if (positionals.length >= 2) {
      const cmd = positionals[1];
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

    // Third positional: depends on command
    if (positionals.length >= 3) {
      const third = positionals[2];
      if (third !== undefined) {
        if (args.command === "restore") {
          args.backupPath = third;
        } else if (args.command === "backup-config") {
          args.configPath = third; // Output path for backup-config
        } else if (args.command === "secret") {
          // For secret: third is subcommand (show/list)
          args.subcommand = third;
        } else {
          args.configPath = third;
        }
      }
    }

    // Fourth positional: for secret show, the secret name
    if (positionals.length >= 4 && args.command === "secret") {
      const fourth = positionals[3];
      if (fourth !== undefined) {
        args.secretName = fourth;
      }
    }

    return Ok(args);
  } catch (e) {
    // Handle unknown options from strict mode
    if (e instanceof Error && e.message.includes("Unknown option")) {
      return Err(new DivbanError(ErrorCode.INVALID_ARGS, e.message));
    }
    throw e;
  }
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

  // Secret requires subcommand
  if (args.command === "secret") {
    if (!(args.subcommand && ["show", "list"].includes(args.subcommand))) {
      return Err(
        new DivbanError(
          ErrorCode.INVALID_ARGS,
          "Secret command requires subcommand. Usage: divban <service> secret <show|list> [name]"
        )
      );
    }
    if (args.subcommand === "show" && !args.secretName) {
      return Err(
        new DivbanError(
          ErrorCode.INVALID_ARGS,
          "Secret name is required for 'show'. Usage: divban <service> secret show <name>"
        )
      );
    }
  }

  return Ok(undefined);
};
