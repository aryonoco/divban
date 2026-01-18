// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * CLI command router and main entry point.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { type Logger, createLogger } from "../lib/logger";
import type { Result } from "../lib/result";
import { Err, Ok } from "../lib/result";
import { getService, initializeServices, listServices } from "../services";
import type { AnyService } from "../services/types";
import { type ParsedArgs, parseArgs, validateArgs } from "./parser";

import { executeBackup } from "./commands/backup";
import { executeDiff } from "./commands/diff";
import { executeGenerate } from "./commands/generate";
import { executeLogs } from "./commands/logs";
import { executeReload } from "./commands/reload";
import { executeRestart } from "./commands/restart";
import { executeRestore } from "./commands/restore";
import { executeSetup } from "./commands/setup";
import { executeStart } from "./commands/start";
import { executeStatus } from "./commands/status";
import { executeStop } from "./commands/stop";
import { executeUpdate } from "./commands/update";
// Import command handlers
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

  // Create logger
  const logger = createLogger({
    level: args.logLevel,
    format: args.format,
  });

  // Handle help
  if (args.help || args.command === "help") {
    const { getMainHelp } = await import("./help");
    console.info(getMainHelp());
    return 0;
  }

  // Handle "all" service (run command on all services)
  if (args.service === "all") {
    return runAllServices(args, logger);
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
  const result = await executeCommand(service, args, logger);

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
  logger: Logger
): Promise<Result<void, DivbanError>> => {
  switch (args.command) {
    case "validate":
      return executeValidate({ service, args, logger });

    case "generate":
      return executeGenerate({ service, args, logger });

    case "diff":
      return executeDiff({ service, args, logger });

    case "setup":
      return executeSetup({ service, args, logger });

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

    case "restore":
      return executeRestore({ service, args, logger });

    case "reload":
      return executeReload({ service, args, logger });

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
 * Run a command on all services.
 */
const runAllServices = async (args: ParsedArgs, logger: Logger): Promise<number> => {
  const services = listServices();

  if (services.length === 0) {
    logger.warn("No services registered");
    return 0;
  }

  // Only certain commands make sense for "all"
  const allowedCommands = ["status", "start", "stop", "restart", "update", "backup"];
  if (!allowedCommands.includes(args.command)) {
    console.error(
      `Error: Command '${args.command}' is not supported for 'all'. Allowed: ${allowedCommands.join(", ")}`
    );
    return ErrorCode.INVALID_ARGS;
  }

  let hasError = false;

  for (const serviceDef of services) {
    const serviceResult = getService(serviceDef.name);
    if (!serviceResult.ok) {
      logger.warn(`Skipping ${serviceDef.name}: ${serviceResult.error.message}`);
      continue;
    }

    const service = serviceResult.value;
    logger.info(`\n=== ${serviceDef.name} ===`);

    const result = await executeCommand(service, args, logger);

    if (!result.ok) {
      logger.fail(`${serviceDef.name}: ${result.error.message}`);
      hasError = true;
    }
  }

  return hasError ? 1 : 0;
};

// Re-export for testing
export { parseArgs, validateArgs } from "./parser";
export { getMainHelp, getServiceHelp } from "./help";
