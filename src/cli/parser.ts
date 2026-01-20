// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based CLI argument parsing using Node.js parseArgs.
 */

import { parseArgs as nodeParseArgs } from "node:util";
import { Effect, Option } from "effect";
import { ErrorCode, GeneralError } from "../lib/errors";

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
  /** Path to global configuration file (divban.toml) */
  globalConfigPath?: string;

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
 * Get the maximum expected positional arguments for a command.
 */
const getMaxPositionals = (command: Command): number => {
  switch (command) {
    case "secret":
      return 4; // service command subcommand [name]
    case "restore":
    case "validate":
    case "generate":
    case "diff":
    case "setup":
    case "backup-config":
      return 3; // service command path
    default:
      return 2; // service command
  }
};

/**
 * Validate no extra positional arguments.
 */
const validateNoExtraPositionals = (
  positionals: string[],
  command: Command
): Effect.Effect<void, GeneralError> => {
  const maxPositionals = getMaxPositionals(command);
  const extra = positionals.slice(maxPositionals);

  const extraOpt = Option.fromNullable(extra.length > 0 ? extra : null);
  if (Option.isSome(extraOpt)) {
    return Effect.fail(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Unexpected arguments: ${extra.join(", ")}. The '${command}' command accepts at most ${maxPositionals} positional arguments.`,
      })
    );
  }
  return Effect.void;
};

/**
 * Node parseArgs result type.
 */
type ParsedValues = {
  help?: boolean;
  version?: boolean;
  verbose?: boolean;
  "dry-run"?: boolean;
  force?: boolean;
  "preserve-data"?: boolean;
  follow?: boolean;
  json?: boolean;
  lines?: string;
  output?: string;
  container?: string;
  "log-level"?: string;
  format?: string;
  "global-config"?: string;
};

/**
 * Apply boolean flags from parsed values to args.
 */
const applyBooleanFlags = (args: ParsedArgs, values: ParsedValues): void => {
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
};

/**
 * Apply string options from parsed values to args.
 */
const applyStringOptions = (args: ParsedArgs, values: ParsedValues): void => {
  const linesOpt = Option.fromNullable(values.lines);
  if (Option.isSome(linesOpt)) {
    const n = Number.parseInt(linesOpt.value, 10);
    if (!Number.isNaN(n) && n > 0) {
      args.lines = n;
    }
  }

  const outputOpt = Option.fromNullable(values.output);
  if (Option.isSome(outputOpt)) {
    args.outputDir = outputOpt.value;
  }

  const containerOpt = Option.fromNullable(values.container);
  if (Option.isSome(containerOpt)) {
    args.container = containerOpt.value;
  }

  const logLevelOpt = Option.fromNullable(values["log-level"]).pipe(
    Option.filter((val) => ["debug", "info", "warn", "error"].includes(val))
  );
  if (Option.isSome(logLevelOpt)) {
    args.logLevel = logLevelOpt.value as ParsedArgs["logLevel"];
  }

  const formatOpt = Option.fromNullable(values.format).pipe(
    Option.filter((val) => ["pretty", "json"].includes(val))
  );
  if (Option.isSome(formatOpt)) {
    args.format = formatOpt.value as ParsedArgs["format"];
  }

  const globalConfigOpt = Option.fromNullable(values["global-config"]);
  if (Option.isSome(globalConfigOpt)) {
    args.globalConfigPath = globalConfigOpt.value;
  }
};

/**
 * Parse the command positional argument.
 */
const parseCommand = (
  positionals: string[],
  args: ParsedArgs
): Effect.Effect<void, GeneralError> => {
  if (positionals.length < 2) {
    args.command = "status";
    return Effect.void;
  }

  const cmd = positionals[1];
  const cmdOpt = Option.fromNullable(cmd).pipe(Option.filter(isCommand));
  if (Option.isSome(cmdOpt)) {
    args.command = cmdOpt.value;
    return Effect.void;
  }

  const rawCmdOpt = Option.fromNullable(cmd);
  if (Option.isSome(rawCmdOpt)) {
    return Effect.fail(
      new GeneralError({
        code: ErrorCode.INVALID_ARGS as 2,
        message: `Unknown command: ${rawCmdOpt.value}. Available commands: ${COMMANDS.join(", ")}`,
      })
    );
  }

  return Effect.void;
};

/**
 * Apply third and fourth positional arguments based on command.
 */
const applyExtraPositionals = (positionals: string[], args: ParsedArgs): void => {
  if (positionals.length >= 3) {
    const thirdOpt = Option.fromNullable(positionals[2]);
    if (Option.isSome(thirdOpt)) {
      if (args.command === "restore") {
        args.backupPath = thirdOpt.value;
      } else if (args.command === "backup-config") {
        args.configPath = thirdOpt.value;
      } else if (args.command === "secret") {
        args.subcommand = thirdOpt.value;
      } else {
        args.configPath = thirdOpt.value;
      }
    }
  }

  if (positionals.length >= 4 && args.command === "secret") {
    const fourthOpt = Option.fromNullable(positionals[3]);
    if (Option.isSome(fourthOpt)) {
      args.secretName = fourthOpt.value;
    }
  }
};

/**
 * Parse command line arguments.
 */
export const parseArgs = (argv: string[]): Effect.Effect<ParsedArgs, GeneralError> =>
  Effect.gen(function* () {
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
          json: { type: "boolean" },
          lines: { type: "string", short: "n" },
          output: { type: "string", short: "o" },
          container: { type: "string", short: "c" },
          "log-level": { type: "string" },
          format: { type: "string" },
          "global-config": { type: "string", short: "g" },
        },
        allowPositionals: true,
        strict: true,
      });

      // Apply flags and options using helper functions
      applyBooleanFlags(args, values);
      applyStringOptions(args, values);

      // Handle empty positionals - show help
      if (positionals.length === 0) {
        args.help = true;
        return args;
      }

      // First positional: service name
      args.service = positionals[0] ?? "";

      // Parse command and extra positionals
      yield* parseCommand(positionals, args);
      applyExtraPositionals(positionals, args);

      // Validate no extra positional arguments
      yield* validateNoExtraPositionals(positionals, args.command);

      return args;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message,
        })
      );
    }
  });

/**
 * Validate parsed arguments for a specific command.
 */
export const validateArgs = (args: ParsedArgs): Effect.Effect<void, GeneralError> =>
  Effect.gen(function* () {
    // Service is always required (except for help)
    if (!(args.help || args.service)) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "Service name is required. Usage: divban <service> <command>",
        })
      );
    }

    // Commands that require config path
    const configRequired = ["validate", "generate", "diff", "setup"];
    if (configRequired.includes(args.command) && !args.configPath) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Config path is required for '${args.command}' command. Usage: divban ${args.service} ${args.command} <config-path>`,
        })
      );
    }

    // Restore requires backup path
    if (args.command === "restore" && !args.backupPath) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message:
            "Backup path is required for 'restore' command. Usage: divban <service> restore <backup-path>",
        })
      );
    }

    // Secret requires subcommand
    if (args.command === "secret") {
      if (!(args.subcommand && ["show", "list"].includes(args.subcommand))) {
        return yield* Effect.fail(
          new GeneralError({
            code: ErrorCode.INVALID_ARGS as 2,
            message:
              "Secret command requires subcommand. Usage: divban <service> secret <show|list> [name]",
          })
        );
      }
      if (args.subcommand === "show" && !args.secretName) {
        return yield* Effect.fail(
          new GeneralError({
            code: ErrorCode.INVALID_ARGS as 2,
            message:
              "Secret name is required for 'show'. Usage: divban <service> secret show <name>",
          })
        );
      }
    }
  });
