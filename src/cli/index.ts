// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based CLI command router and main entry point.
 */

import { Effect, Option } from "effect";
import { loadGlobalConfig } from "../config/loader";
import { getLoggingSettings } from "../config/merge";
import type { GlobalConfig } from "../config/schema";
import {
  type BackupError,
  type ConfigError,
  type ContainerError,
  ErrorCode,
  GeneralError,
  type ServiceError,
  type SystemError,
} from "../lib/errors";
import { type LogLevel, type Logger, createLogger } from "../lib/logger";
import { toAbsolutePathEffect } from "../lib/paths";
import { getService, initializeServices, listServices } from "../services";
import type { AnyServiceEffect, ServiceDefinition } from "../services/types";
import { type ParsedArgs, parseArgs, validateArgs } from "./parser";

// Import Effect-based command handlers
import { executeBackup } from "./commands/backup";
import { executeBackupConfig } from "./commands/backup-config";
import { executeDiff } from "./commands/diff";
import { executeGenerate } from "./commands/generate";
import { executeLogs } from "./commands/logs";
import { executeReload } from "./commands/reload";
import { executeRemove } from "./commands/remove";
import { executeRestart } from "./commands/restart";
import { executeRestore } from "./commands/restore";
import { executeSecret } from "./commands/secret";
import { executeSetup } from "./commands/setup";
import { executeStart } from "./commands/start";
import { executeStatus } from "./commands/status";
import { executeStop } from "./commands/stop";
import { executeUpdate } from "./commands/update";
import { executeValidate } from "./commands/validate";

type DivbanEffectError =
  | GeneralError
  | ConfigError
  | SystemError
  | ServiceError
  | ContainerError
  | BackupError;

/**
 * Run the CLI with the given arguments.
 */
export const run = async (argv: string[]): Promise<number> => {
  // Initialize services registry
  await initializeServices();

  const program = Effect.gen(function* () {
    // Parse arguments
    const args = yield* parseArgs(argv);

    // Handle version flag early
    if (args.version) {
      const pkg = yield* Effect.promise(() => import("../../package.json"));
      console.info(`divban ${pkg.version}`);
      return 0;
    }

    // Validate global config path if provided
    const validatedPath = Option.isSome(Option.fromNullable(args.globalConfigPath))
      ? yield* toAbsolutePathEffect(args.globalConfigPath as string)
      : undefined;

    // Load global configuration (always loads, returns defaults if no file)
    const globalConfig = yield* loadGlobalConfig(validatedPath);

    // Apply logging settings: CLI args override global config
    const loggingSettings = getLoggingSettings(globalConfig);
    let effectiveLogLevel: LogLevel;
    if (args.verbose) {
      effectiveLogLevel = "debug";
    } else if (args.logLevel !== "info") {
      effectiveLogLevel = args.logLevel;
    } else {
      effectiveLogLevel = loggingSettings.level;
    }
    const effectiveFormat = args.format !== "pretty" ? args.format : loggingSettings.format;

    // Create logger with effective settings
    const logger = createLogger({
      level: effectiveLogLevel,
      format: effectiveFormat,
    });

    // Handle help
    if (args.help || args.command === "help") {
      const { getMainHelp } = yield* Effect.promise(() => import("./help"));
      console.info(getMainHelp());
      return 0;
    }

    // Handle "all" service (run command on all services)
    if (args.service === "all") {
      return yield* runAllServices(args, logger, globalConfig);
    }

    // Get the service
    const service = yield* getService(args.service);

    // Validate arguments for specific command
    yield* validateArgs(args);

    // Execute command
    const result = yield* Effect.either(executeCommand(service, args, logger, globalConfig));

    if (result._tag === "Left") {
      if (args.format === "json") {
        logger.raw(
          JSON.stringify({
            error: result.left.message,
            code: (result.left as DivbanEffectError & { code: number }).code,
          })
        );
      } else {
        logger.fail(result.left.message);
      }
      return (result.left as DivbanEffectError & { code: number }).code;
    }

    return 0;
  });

  const exit = await Effect.runPromiseExit(program);
  if (exit._tag === "Failure") {
    const error = exit.cause;
    if ("_tag" in error && error._tag === "Fail") {
      const err = error.error as DivbanEffectError & { code: number };
      console.error(`Error: ${err.message}`);
      return err.code;
    }
    // Unexpected error
    console.error("Unexpected error:", error);
    return 1;
  }

  return exit.value;
};

/**
 * Execute a command on a single service.
 */
const executeCommand = (
  service: AnyServiceEffect,
  args: ParsedArgs,
  logger: Logger,
  globalConfig: GlobalConfig
): Effect.Effect<void, DivbanEffectError> => {
  switch (args.command) {
    case "validate":
      return executeValidate({ service, args, logger });

    case "generate":
      return executeGenerate({ service, args, logger });

    case "diff":
      return executeDiff({ service, args, logger });

    case "setup":
      return executeSetup({ service, args, logger, globalConfig });

    case "start":
      return executeStart({ service, args, logger });

    case "stop":
      return executeStop({ service, args, logger });

    case "restart":
      return executeRestart({ service, args, logger });

    case "status":
      return executeStatus({ service, args, logger });

    case "logs":
      return executeLogs({ service, args, logger });

    case "update":
      return executeUpdate({ service, args, logger });

    case "backup":
      return executeBackup({ service, args, logger });

    case "backup-config":
      return executeBackupConfig({ service, args, logger });

    case "restore":
      return executeRestore({ service, args, logger });

    case "reload":
      return executeReload({ service, args, logger });

    case "remove":
      return executeRemove({ service, args, logger });

    case "secret":
      return executeSecret({ service, args, logger });

    case "help":
      return Effect.void;

    default:
      return Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Unknown command: ${args.command}`,
        })
      );
  }
};

/**
 * Run command on single service, returning Option<errorCode> for first-error tracking.
 */
const runServiceCommand = (
  serviceDef: ServiceDefinition,
  args: ParsedArgs,
  logger: Logger,
  globalConfig: GlobalConfig
): Effect.Effect<Option.Option<number>, never> =>
  Effect.gen(function* () {
    const serviceResult = yield* Effect.either(getService(serviceDef.name));
    if (serviceResult._tag === "Left") {
      logger.warn(`Skipping ${serviceDef.name}: ${serviceResult.left.message}`);
      return Option.none(); // Skip doesn't count as error
    }

    logger.info(`\n=== ${serviceDef.name} ===`);
    const result = yield* Effect.either(
      executeCommand(serviceResult.right, args, logger, globalConfig)
    );

    if (result._tag === "Left") {
      logger.fail(`${serviceDef.name}: ${result.left.message}`);
      return Option.some((result.left as DivbanEffectError & { code: number }).code);
    }

    return Option.none();
  });

/**
 * Run a command on all services, preserving first error code.
 */
const runAllServices = (
  args: ParsedArgs,
  logger: Logger,
  globalConfig: GlobalConfig
): Effect.Effect<number, GeneralError> =>
  Effect.gen(function* () {
    const services = listServices();

    if (services.length === 0) {
      logger.warn("No services registered");
      return 0;
    }

    // Only certain commands make sense for "all"
    const allowedCommands = [
      "status",
      "start",
      "stop",
      "restart",
      "update",
      "backup",
      "backup-config",
    ];
    if (!allowedCommands.includes(args.command)) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Command '${args.command}' is not supported for 'all'. Allowed: ${allowedCommands.join(", ")}`,
        })
      );
    }

    // Sequential execution: run all services, track first error via Option
    let firstError: Option.Option<number> = Option.none();
    for (const serviceDef of services) {
      const errorOpt = yield* runServiceCommand(serviceDef, args, logger, globalConfig);
      // Keep first error, ignore subsequent errors
      if (Option.isNone(firstError) && Option.isSome(errorOpt)) {
        firstError = errorOpt;
      }
    }

    return Option.getOrElse(firstError, () => 0);
  });

// Re-export for testing
export { parseArgs, validateArgs } from "./parser";
export { getMainHelp, getServiceHelp } from "./help";
