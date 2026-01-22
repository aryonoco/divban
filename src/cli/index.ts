// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based CLI command router and main entry point.
 */

import { Effect, Match, Option, pipe } from "effect";
import { type EnvConfig, EnvConfigSpec, resolveLogFormat, resolveLogLevel } from "../config/env";
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
import { type Logger, createLogger } from "../lib/logger";
import { toAbsolutePathEffect } from "../lib/paths";
import { getService, initializeServices, listServices } from "../services";
import type { AnyServiceEffect, ServiceDefinition } from "../services/types";
import { type Command, type ParsedArgs, parseArgs, validateArgs } from "./parser";

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

export type DivbanEffectError =
  | GeneralError
  | ConfigError
  | SystemError
  | ServiceError
  | ContainerError
  | BackupError;

/**
 * CLI program as pure Effect.
 * Initialization and execution happen in the Effect context.
 * Error type is unknown since we handle various error types (our custom errors + Effect's ConfigError)
 * dynamically at runtime in the entry point.
 */
export const program = (argv: readonly string[]): Effect.Effect<number, unknown> =>
  Effect.gen(function* () {
    // Initialize services registry inside Effect
    yield* Effect.promise(() => initializeServices());

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

    // Load environment config - this is where Config effects are run
    // (the "imperative shell" boundary)
    const envConfig: EnvConfig = yield* EnvConfigSpec;

    // Resolve effective settings using pure functions
    // Priority: CLI args > env vars > global config
    const loggingSettings = getLoggingSettings(globalConfig);
    const effectiveLogLevel = resolveLogLevel(
      args.verbose,
      args.logLevel,
      envConfig,
      loggingSettings.level
    );
    const effectiveFormat = resolveLogFormat(args.format, envConfig, loggingSettings.format);

    // Create logger with effective settings
    const logger = createLogger({
      level: effectiveLogLevel,
      format: effectiveFormat,
    });

    // Handle help
    if (args.help || args.command === "help") {
      const [{ getMainHelp }, pkg] = yield* Effect.all([
        Effect.promise(() => import("./help")),
        Effect.promise(() => import("../../package.json")),
      ]);
      console.info(getMainHelp(pkg.version));
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

/**
 * Execute a command on a single service.
 * Uses Match.exhaustive for compile-time totality checking.
 */
const executeCommand = (
  service: AnyServiceEffect,
  args: ParsedArgs,
  logger: Logger,
  globalConfig: GlobalConfig
): Effect.Effect<void, DivbanEffectError> =>
  Match.value(args.command).pipe(
    Match.when("validate", () => executeValidate({ service, args, logger })),
    Match.when("generate", () => executeGenerate({ service, args, logger })),
    Match.when("diff", () => executeDiff({ service, args, logger })),
    Match.when("setup", () => executeSetup({ service, args, logger, globalConfig })),
    Match.when("start", () => executeStart({ service, args, logger })),
    Match.when("stop", () => executeStop({ service, args, logger })),
    Match.when("restart", () => executeRestart({ service, args, logger })),
    Match.when("status", () => executeStatus({ service, args, logger })),
    Match.when("logs", () => executeLogs({ service, args, logger })),
    Match.when("update", () => executeUpdate({ service, args, logger })),
    Match.when("backup", () => executeBackup({ service, args, logger })),
    Match.when("backup-config", () => executeBackupConfig({ service, args, logger })),
    Match.when("restore", () => executeRestore({ service, args, logger })),
    Match.when("reload", () => executeReload({ service, args, logger })),
    Match.when("remove", () => executeRemove({ service, args, logger })),
    Match.when("secret", () => executeSecret({ service, args, logger })),
    Match.when("help", () => Effect.void),
    Match.exhaustive
  );

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
 * Allowed commands for "all" target.
 */
const ALLOWED_ALL_COMMANDS = [
  "status",
  "start",
  "stop",
  "restart",
  "update",
  "backup",
  "backup-config",
] as const;

type AllowedAllCommand = (typeof ALLOWED_ALL_COMMANDS)[number];

const isAllowedAllCommand = (cmd: Command): cmd is AllowedAllCommand =>
  (ALLOWED_ALL_COMMANDS as readonly string[]).includes(cmd);

/**
 * Validate command is allowed for "all" target.
 */
const validateAllServicesCommand = (command: Command): Effect.Effect<void, GeneralError> =>
  isAllowedAllCommand(command)
    ? Effect.void
    : Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Command '${command}' is not supported for 'all'. Allowed: ${ALLOWED_ALL_COMMANDS.join(", ")}`,
        })
      );

/**
 * Run a command on all services, preserving first error code.
 * Uses Effect.reduce (foldlM pattern) instead of mutable loop.
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

    yield* validateAllServicesCommand(args.command);

    // Effect.reduce: effectful fold accumulating first error as Option
    const firstError = yield* Effect.reduce(services, Option.none<number>(), (acc, serviceDef) =>
      pipe(
        runServiceCommand(serviceDef, args, logger, globalConfig),
        Effect.map((errorOpt) =>
          // Keep first error only
          Option.isNone(acc) && Option.isSome(errorOpt) ? errorOpt : acc
        )
      )
    );

    return Option.getOrElse(firstError, () => 0);
  });

// Re-export for testing
export { parseArgs, validateArgs } from "./parser";
export { getMainHelp, getServiceHelp } from "./help";
