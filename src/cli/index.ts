/**
 * CLI command router and main entry point.
 */

import { DivbanError, ErrorCode } from "../lib/errors";
import { createLogger, type Logger } from "../lib/logger";
import type { Result } from "../lib/result";
import { Err, Ok } from "../lib/result";
import { getService, initializeServices, listServices } from "../services";
import type { Service } from "../services/types";
import { getMainHelp, getServiceHelp } from "./help";
import { parseArgs, validateArgs, type ParsedArgs } from "./parser";

// Import command handlers
import { executeValidate } from "./commands/validate";
import { executeGenerate } from "./commands/generate";
import { executeDiff } from "./commands/diff";
import { executeSetup } from "./commands/setup";
import { executeStart } from "./commands/start";
import { executeStop } from "./commands/stop";
import { executeRestart } from "./commands/restart";
import { executeStatus } from "./commands/status";
import { executeLogs } from "./commands/logs";
import { executeUpdate } from "./commands/update";
import { executeBackup } from "./commands/backup";
import { executeRestore } from "./commands/restore";
import { executeReload } from "./commands/reload";

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

  // Create logger
  const logger = createLogger({
    level: args.logLevel,
    format: args.format,
  });

  // Handle help
  if (args.help || args.command === "help") {
    if (args.service && args.service !== "help") {
      console.log(getServiceHelp(args.service));
    } else {
      console.log(getMainHelp());
    }
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
      console.log(
        JSON.stringify({
          error: result.error.message,
          code: result.error.code,
        })
      );
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
const executeCommand = async (
  service: Service,
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

    case "help":
      console.log(getServiceHelp(service.definition.name));
      return Ok(undefined);

    default:
      return Err(
        new DivbanError(
          ErrorCode.INVALID_ARGS,
          `Unknown command: ${args.command}`
        )
      );
  }
};

/**
 * Run a command on all services.
 */
const runAllServices = async (
  args: ParsedArgs,
  logger: Logger
): Promise<number> => {
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
