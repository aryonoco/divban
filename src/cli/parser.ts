// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * CLI argument parsing using Node.js parseArgs.
 */

import { parseArgs as nodeParseArgs } from "node:util";
import { Array as Arr, Effect, Match, Option, pipe } from "effect";
import { ErrorCode, GeneralError } from "../lib/errors";

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
  "backup-config",
  "restore",
  "reload",
  "remove",
  "secret",
  "help",
] as const;

export type Command = (typeof COMMANDS)[number];

/**
 * Parsed command line arguments.
 */
export interface ParsedArgs {
  readonly service: string;
  readonly command: Command;
  readonly configPath?: string;
  readonly outputDir?: string;
  readonly backupPath?: string;
  readonly container?: string;
  readonly subcommand?: string;
  readonly secretName?: string;
  readonly globalConfigPath?: string;
  readonly help: boolean;
  readonly version: boolean;
  readonly verbose: boolean;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly preserveData: boolean;
  readonly follow: boolean;
  readonly lines: number;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly format: "pretty" | "json";
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
 * Type guard for Command.
 */
export const isCommand = (s: string): s is Command => (COMMANDS as readonly string[]).includes(s);

/**
 * Parse options for nodeParseArgs.
 */
const PARSE_OPTIONS = {
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
} as const;

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

// ============================================================================
// Safe Array Access (Total Functions)
// ============================================================================

/**
 * Safe array access returning Option.
 * Handles noUncheckedIndexedAccess.
 */
const getPositional = (positionals: readonly string[], index: number): Option.Option<string> =>
  Arr.get(positionals, index);

// ============================================================================
// Extractors
// ============================================================================

/**
 * Extract service from first positional.
 */
const parseService = (positionals: readonly string[]): string =>
  pipe(
    getPositional(positionals, 0),
    Option.getOrElse(() => "")
  );

/**
 * Parse command from second positional.
 * Returns Effect to handle invalid command error.
 */
const parseCommand = (positionals: readonly string[]): Effect.Effect<Command, GeneralError> =>
  Option.match(getPositional(positionals, 1), {
    onNone: (): Effect.Effect<Command, GeneralError> => Effect.succeed("status" as Command),
    onSome: (cmd): Effect.Effect<Command, GeneralError> =>
      isCommand(cmd)
        ? Effect.succeed(cmd)
        : Effect.fail(
            new GeneralError({
              code: ErrorCode.INVALID_ARGS as 2,
              message: `Unknown command: ${cmd}. Available commands: ${COMMANDS.join(", ")}`,
            })
          ),
  });

/**
 * Get maximum positionals for command using Match (exhaustive).
 */
const getMaxPositionals = (command: Command): number =>
  Match.value(command).pipe(
    Match.when("secret", () => 4),
    Match.when("restore", () => 3),
    Match.when("validate", () => 3),
    Match.when("generate", () => 3),
    Match.when("diff", () => 3),
    Match.when("setup", () => 3),
    Match.when("backup-config", () => 3),
    Match.orElse(() => 2)
  );

/**
 * Validate no extra positional arguments.
 */
const validateNoExtraPositionals = (
  positionals: readonly string[],
  command: Command
): Effect.Effect<void, GeneralError> => {
  const maxPositionals = getMaxPositionals(command);
  const extraCount = positionals.length - maxPositionals;

  return extraCount > 0
    ? Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Unexpected arguments: ${positionals.slice(maxPositionals).join(", ")}. The '${command}' command accepts at most ${maxPositionals} positional arguments.`,
        })
      )
    : Effect.void;
};

/**
 * Extract boolean flags as partial object.
 */
const extractBooleanFlags = (values: ParsedValues): Partial<ParsedArgs> => ({
  help: values.help ?? false,
  version: values.version ?? false,
  verbose: values.verbose ?? false,
  dryRun: values["dry-run"] ?? false,
  force: values.force ?? false,
  preserveData: values["preserve-data"] ?? false,
  follow: values.follow ?? false,
  ...(values.verbose === true && { logLevel: "debug" as const }),
  ...(values.json === true && { format: "json" as const }),
});

/**
 * Parse lines option.
 */
const parseLines = (lines: string | undefined): number | undefined => {
  if (lines === undefined) {
    return undefined;
  }
  const n = Number.parseInt(lines, 10);
  return Number.isNaN(n) || n <= 0 ? undefined : n;
};

/**
 * Validate log level option.
 */
const validateLogLevel = (level: string | undefined): ParsedArgs["logLevel"] | undefined => {
  if (level === undefined) {
    return undefined;
  }
  return ["debug", "info", "warn", "error"].includes(level)
    ? (level as ParsedArgs["logLevel"])
    : undefined;
};

/**
 * Validate format option.
 */
const validateFormat = (format: string | undefined): ParsedArgs["format"] | undefined => {
  if (format === undefined) {
    return undefined;
  }
  return ["pretty", "json"].includes(format) ? (format as ParsedArgs["format"]) : undefined;
};

/**
 * Extract string options
 */
const extractStringOptions = (values: ParsedValues): Partial<ParsedArgs> => {
  const lines = parseLines(values.lines);
  const logLevel = validateLogLevel(values["log-level"]);
  const format = validateFormat(values.format);

  return {
    ...(lines !== undefined && { lines }),
    ...(values.output !== undefined && { outputDir: values.output }),
    ...(values.container !== undefined && { container: values.container }),
    ...(values["global-config"] !== undefined && { globalConfigPath: values["global-config"] }),
    ...(logLevel !== undefined && { logLevel }),
    ...(format !== undefined && { format }),
  };
};

/**
 * Extract positional args based on command
 */
const extractPositionalArgs = (
  positionals: readonly string[],
  command: Command
): Partial<ParsedArgs> =>
  Option.match(getPositional(positionals, 2), {
    onNone: (): Partial<ParsedArgs> => ({}),
    onSome: (third): Partial<ParsedArgs> =>
      Match.value(command).pipe(
        Match.when("restore", () => ({ backupPath: third })),
        Match.when("backup-config", () => ({ configPath: third })),
        Match.when("secret", (): Partial<ParsedArgs> => {
          const fourthOpt = getPositional(positionals, 3);
          return Option.isSome(fourthOpt)
            ? { subcommand: third, secretName: fourthOpt.value }
            : { subcommand: third };
        }),
        Match.orElse(() => ({ configPath: third }))
      ),
  });

// ============================================================================
// Main Parse Function
// ============================================================================

/**
 * Build parsed args from values and positionals.
 */
const buildParsedArgs = (
  values: ParsedValues,
  positionals: readonly string[]
): Effect.Effect<ParsedArgs, GeneralError> =>
  Effect.gen(function* () {
    if (positionals.length === 0) {
      // Preserve boolean flags (version, verbose, etc) from parsed values
      // If no version flag, show help by default
      const flags = extractBooleanFlags(values);
      return { ...defaultArgs, ...flags, help: !flags.version };
    }

    const service = parseService(positionals);
    const command = yield* parseCommand(positionals);
    yield* validateNoExtraPositionals(positionals, command);

    return {
      ...defaultArgs,
      ...extractBooleanFlags(values),
      ...extractStringOptions(values),
      ...extractPositionalArgs(positionals, command),
      service,
      command,
    };
  });

/**
 * Parse raw args
 */
const parseRawArgs = (argv: readonly string[]): { values: ParsedValues; positionals: string[] } =>
  nodeParseArgs({
    args: [...argv],
    options: PARSE_OPTIONS,
    allowPositionals: true,
    strict: true,
  }) as { values: ParsedValues; positionals: string[] };

/**
 * Convert parse error to GeneralError.
 */
const toParseError = (e: unknown): GeneralError =>
  new GeneralError({
    code: ErrorCode.INVALID_ARGS as 2,
    message: e instanceof Error ? e.message : String(e),
  });

/**
 * Parse command line arguments.
 */
export const parseArgs = (argv: readonly string[]): Effect.Effect<ParsedArgs, GeneralError> => {
  const tryParse = (): { values: ParsedValues; positionals: string[] } => parseRawArgs(argv);

  return pipe(
    Effect.try({ try: tryParse, catch: toParseError }),
    Effect.flatMap(({ values, positionals }) => buildParsedArgs(values, positionals))
  );
};

/**
 * Validate parsed arguments for a specific command.
 */
export const validateArgs = (args: ParsedArgs): Effect.Effect<void, GeneralError> =>
  Effect.gen(function* () {
    if (!(args.help || args.service)) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "Service name is required. Usage: divban <service> <command>",
        })
      );
    }

    const configRequired: readonly Command[] = ["validate", "generate", "diff", "setup"];
    if (configRequired.includes(args.command) && args.configPath === undefined) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Config path is required for '${args.command}' command. Usage: divban ${args.service} ${args.command} <config-path>`,
        })
      );
    }

    if (args.command === "restore" && args.backupPath === undefined) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message:
            "Backup path is required for 'restore' command. Usage: divban <service> restore <backup-path>",
        })
      );
    }

    if (args.command === "secret") {
      if (args.subcommand === undefined || !["show", "list"].includes(args.subcommand)) {
        return yield* Effect.fail(
          new GeneralError({
            code: ErrorCode.INVALID_ARGS as 2,
            message:
              "Secret command requires subcommand. Usage: divban <service> secret <show|list> [name]",
          })
        );
      }
      if (args.subcommand === "show" && args.secretName === undefined) {
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
