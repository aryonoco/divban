// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * CLI command router and main entry point.
 */

import { loadGlobalConfig } from "../config/loader";
import { getLoggingSettings } from "../config/merge";
import type { GlobalConfig } from "../config/schema";
import { DivbanError, ErrorCode } from "../lib/errors";
import { type LogLevel, type Logger, createLogger } from "../lib/logger";
import {
  None,
  type Option,
  Some,
  fromUndefined,
  getOrElse,
  isNone,
  mapOption,
  transpose,
} from "../lib/option";
import { toAbsolutePath } from "../lib/paths";
import type { Result } from "../lib/result";
import { Err, Ok } from "../lib/result";
import { getService, initializeServices, listServices } from "../services";
import type { AnyService, ServiceDefinition } from "../services/types";
import { type ParsedArgs, parseArgs, validateArgs } from "./parser";

// Import command handlers
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

/**
 * Run the CLI with the given arguments.
 */
export const run = async (argv: string[]): Promise<number> => {
  // Initialize services registry
  await initializeServices();

  // Parse arguments
  const argsResult = parseArgs(argv);
  if (!argsResult.ok) {
    console.error(`Error: ${argsResult.error.message}`);
    return argsResult.error.code;
  }

  const args = argsResult.value;

  // Handle version flag early
  if (args.version) {
    const pkg = await import("../../package.json");
    console.info(`divban ${pkg.version}`);
    return 0;
  }

  // Validate global config path if provided using Option → Result transformation
  const globalConfigPathOpt = fromUndefined(args.globalConfigPath);
  const validatedPathResult = transpose(mapOption(globalConfigPathOpt, toAbsolutePath));
  if (!validatedPathResult.ok) {
    console.error(`Error: ${validatedPathResult.error.message}`);
    return validatedPathResult.error.code;
  }
  // Extract Option<AbsolutePath> to AbsolutePath | undefined for loadGlobalConfig
  const validatedPath = validatedPathResult.value.isSome
    ? validatedPathResult.value.value
    : undefined;

  // Load global configuration (always loads, returns defaults if no file)
  const globalConfigResult = await loadGlobalConfig(validatedPath);
  if (!globalConfigResult.ok) {
    console.error(`Error loading global config: ${globalConfigResult.error.message}`);
    return globalConfigResult.error.code;
  }
  const globalConfig = globalConfigResult.value;

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
    const { getMainHelp } = await import("./help");
    console.info(getMainHelp());
    return 0;
  }

  // Handle "all" service (run command on all services)
  if (args.service === "all") {
    return runAllServices(args, logger, globalConfig);
  }

  // Get the service
  const serviceResult = getService(args.service);
  if (!serviceResult.ok) {
    console.error(`Error: ${serviceResult.error.message}`);
    return serviceResult.error.code;
  }

  const service = serviceResult.value;

  // Validate arguments for specific command
  const validateResult = validateArgs(args);
  if (!validateResult.ok) {
    console.error(`Error: ${validateResult.error.message}`);
    return validateResult.error.code;
  }

  // Execute command
  const result = await executeCommand(service, args, logger, globalConfig);

  if (!result.ok) {
    if (args.format === "json") {
      logger.raw(JSON.stringify({ error: result.error.message, code: result.error.code }));
    } else {
      logger.fail(result.error.message);
    }
    return result.error.code;
  }

  return 0;
};

/**
 * Execute a command on a single service.
 */
const executeCommand = (
  service: AnyService,
  args: ParsedArgs,
  logger: Logger,
  globalConfig: GlobalConfig
): Promise<Result<void, DivbanError>> => {
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

    case "help": {
      return Promise.resolve(Ok(undefined));
    }

    default:
      return Promise.resolve(
        Err(new DivbanError(ErrorCode.INVALID_ARGS, `Unknown command: ${args.command}`))
      );
  }
};

/**
 * Run command on single service, returning Option<errorCode> for first-error tracking.
 */
const runServiceCommand = async (
  serviceDef: ServiceDefinition,
  args: ParsedArgs,
  logger: Logger,
  globalConfig: GlobalConfig
): Promise<Option<number>> => {
  const serviceResult = getService(serviceDef.name);
  if (!serviceResult.ok) {
    logger.warn(`Skipping ${serviceDef.name}: ${serviceResult.error.message}`);
    return None; // Skip doesn't count as error
  }

  logger.info(`\n=== ${serviceDef.name} ===`);
  const result = await executeCommand(serviceResult.value, args, logger, globalConfig);

  if (!result.ok) {
    logger.fail(`${serviceDef.name}: ${result.error.message}`);
    return Some(result.error.code);
  }

  return None;
};

/**
 * Run a command on all services, preserving first error code.
 * Uses sequential reduce to maintain order while tracking first error via Option.
 */
const runAllServices = async (
  args: ParsedArgs,
  logger: Logger,
  globalConfig: GlobalConfig
): Promise<number> => {
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
    console.error(
      `Error: Command '${args.command}' is not supported for 'all'. Allowed: ${allowedCommands.join(", ")}`
    );
    return ErrorCode.INVALID_ARGS;
  }

  // Sequential reduce: run all services, track first error via Option
  const firstError = await services.reduce(
    async (accPromise, serviceDef) => {
      const acc = await accPromise;
      const errorOpt = await runServiceCommand(serviceDef, args, logger, globalConfig);
      // Keep first error (acc), ignore subsequent errors
      return isNone(acc) ? errorOpt : acc;
    },
    Promise.resolve(None as Option<number>)
  );

  return getOrElse(firstError, 0);
};

// Re-export for testing
export { parseArgs, validateArgs } from "./parser";
export { getMainHelp, getServiceHelp } from "./help";
