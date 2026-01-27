// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * CLI command tree built with @effect/cli. Declarative subcommand
 * definitions with typed argument parsing and auto-generated help.
 * Each subcommand spreads global options and dispatches to the
 * corresponding handler in commands/.
 */

import { Command } from "@effect/cli";
import type { CliApp } from "@effect/cli/CliApp";
import { Effect, Either, Match, Option, pipe } from "effect";
import { type EnvConfig, EnvConfigSpec, resolveLogFormat, resolveLogLevel } from "../config/env";
import { loadGlobalConfig } from "../config/loader";
import { getLoggingSettings } from "../config/merge";
import type { GlobalConfig } from "../config/schema";
import { type ConfigError, type DivbanEffectError, ErrorCode, GeneralError } from "../lib/errors";
import { type Logger, createLogger } from "../lib/logger";
import { toAbsolutePathEffect } from "../lib/paths";
import type { AbsolutePath } from "../lib/types";
import { DIVBAN_VERSION } from "../lib/version";
import { getService, initializeServices, listServices } from "../services";
import type { ExistentialService, ServiceDefinition } from "../services/types";

import { executeBackup } from "./commands/backup";
import { executeBackupConfig } from "./commands/backup-config";
import { executeDiff } from "./commands/diff";
import { executeGenerate } from "./commands/generate";
import { executeLogs } from "./commands/logs";
import { executeReload } from "./commands/reload";
import { executeRemove } from "./commands/remove";
import { executeRestart } from "./commands/restart";
import { executeRestore } from "./commands/restore";
import { executeSecretList, executeSecretShow } from "./commands/secret";
import { executeSetup } from "./commands/setup";
import { executeStart } from "./commands/start";
import { executeStatus } from "./commands/status";
import { executeStop } from "./commands/stop";
import { executeUpdate } from "./commands/update";
import { executeValidate } from "./commands/validate";

import {
  type GlobalOptions,
  allFlag,
  backupPathArg,
  configArg,
  container,
  effectiveFormat,
  follow,
  globalOptions,
  lines,
  optionalConfigArg,
  optionalServiceArg,
  outputDir,
  preserveData,
  secretNameArg,
  serviceArg,
} from "./options";

interface CommandContext {
  readonly logger: Logger;
  readonly globalConfig: GlobalConfig;
  readonly format: "pretty" | "json";
}

// --- Context resolution ---

const resolveGlobalConfigPath = (
  globals: GlobalOptions
): Effect.Effect<AbsolutePath | undefined, ConfigError> =>
  Option.match(globals.globalConfig, {
    onNone: (): Effect.Effect<AbsolutePath | undefined, ConfigError> => Effect.succeed(undefined),
    onSome: (path): Effect.Effect<AbsolutePath | undefined, ConfigError> =>
      toAbsolutePathEffect(path),
  });

const resolveContext = (globals: GlobalOptions): Effect.Effect<CommandContext, unknown> =>
  Effect.gen(function* () {
    const validatedPath = yield* resolveGlobalConfigPath(globals);
    const globalConfig = yield* loadGlobalConfig(validatedPath);
    const envConfig: EnvConfig = yield* EnvConfigSpec;

    const loggingSettings = getLoggingSettings(globalConfig);
    const format = effectiveFormat(globals);
    const effectiveLogLevel = resolveLogLevel(
      globals.verbose,
      globals.logLevel,
      envConfig,
      loggingSettings.level
    );
    const effectiveLogFormat = resolveLogFormat(format, envConfig, loggingSettings.format);

    const logger = createLogger({
      level: effectiveLogLevel,
      format: effectiveLogFormat,
    });

    return { logger, globalConfig, format };
  });

// --- Error display ---

const isDivbanError = (err: unknown): err is DivbanEffectError =>
  typeof err === "object" && err !== null && "_tag" in err && "code" in err && "message" in err;

const displayError = (err: unknown, logger: Logger, format: "pretty" | "json"): void => {
  if (!isDivbanError(err)) {
    return;
  }
  pipe(
    Match.value(format),
    Match.when("json", () => logger.raw(JSON.stringify({ error: err.message, code: err.code }))),
    Match.when("pretty", () => logger.fail(err.message)),
    Match.exhaustive
  );
};

// --- Command runner ---

/**
 * Wraps a command handler with service initialization, context resolution,
 * and error display. All commands go through this wrapper.
 */
const runCommand = (
  globals: GlobalOptions,
  handler: (ctx: CommandContext) => Effect.Effect<void, unknown>
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    yield* Effect.promise(() => initializeServices());
    const ctx = yield* resolveContext(globals);
    yield* pipe(
      handler(ctx),
      Effect.tapError((err) => Effect.sync(() => displayError(err, ctx.logger, ctx.format)))
    );
  });

// --- All-services support ---

const runServiceForAll = (
  serviceDef: ServiceDefinition,
  runSingle: (service: ExistentialService) => Effect.Effect<void, unknown>,
  logger: Logger
): Effect.Effect<Option.Option<number>, never> =>
  Effect.gen(function* () {
    const serviceResult = yield* Effect.either(getService(serviceDef.name));
    return yield* Either.match(serviceResult, {
      onLeft: (err): Effect.Effect<Option.Option<number>, never> => {
        logger.warn(`Skipping ${serviceDef.name}: ${err.message}`);
        return Effect.succeed(Option.none<number>());
      },
      onRight: (service): Effect.Effect<Option.Option<number>, never> =>
        Effect.gen(function* () {
          logger.info(`\n=== ${serviceDef.name} ===`);
          const result = yield* Effect.either(runSingle(service));
          return Either.match(result, {
            onLeft: (e): Option.Option<number> => {
              if (!isDivbanError(e)) {
                logger.fail(`${serviceDef.name}: Unknown error`);
                return Option.some(1);
              }
              logger.fail(`${serviceDef.name}: ${e.message}`);
              return Option.some(e.code);
            },
            onRight: (): Option.Option<number> => Option.none(),
          });
        }),
    });
  });

const runOnAllServices = (
  runSingle: (service: ExistentialService) => Effect.Effect<void, unknown>,
  logger: Logger
): Effect.Effect<void, GeneralError> =>
  Effect.gen(function* () {
    const services = listServices();

    yield* Effect.if(services.length === 0, {
      onTrue: (): Effect.Effect<void, never> =>
        Effect.sync(() => logger.warn("No services registered")),
      onFalse: (): Effect.Effect<void, GeneralError> =>
        Effect.gen(function* () {
          const firstError = yield* Effect.reduce(
            services,
            Option.none<number>(),
            (acc, serviceDef) =>
              pipe(
                runServiceForAll(serviceDef, runSingle, logger),
                Effect.map((errorOpt) =>
                  Option.match(acc, {
                    onSome: (): Option.Option<number> => acc,
                    onNone: (): Option.Option<number> => errorOpt,
                  })
                )
              )
          );

          yield* Option.match(firstError, {
            onNone: (): Effect.Effect<void, never> => Effect.void,
            onSome: (code): Effect.Effect<void, GeneralError> =>
              Effect.fail(
                new GeneralError({
                  code: code as 1 satisfies 1,
                  message: "One or more services failed",
                })
              ),
          });
        }),
    });
  });

/** Multiplexes single-service and --all modes so each command doesn't duplicate the dispatch logic. */
const requireServiceOrAll = (
  serviceOpt: Option.Option<string>,
  all: boolean,
  runSingle: (service: ExistentialService) => Effect.Effect<void, unknown>,
  logger: Logger
): Effect.Effect<void, unknown> =>
  Effect.if(all, {
    onTrue: (): Effect.Effect<void, GeneralError> => runOnAllServices(runSingle, logger),
    onFalse: (): Effect.Effect<void, unknown> =>
      Option.match(serviceOpt, {
        onNone: (): Effect.Effect<void, GeneralError> =>
          Effect.fail(
            new GeneralError({
              code: ErrorCode.INVALID_ARGS,
              message: "Service name required (or use --all)",
            })
          ),
        onSome: (name): Effect.Effect<void, unknown> =>
          Effect.gen(function* () {
            const service = yield* getService(name);
            yield* runSingle(service);
          }),
      }),
  });

// --- Subcommand definitions ---

const validateCmd = Command.make(
  "validate",
  { ...globalOptions, service: serviceArg, config: configArg },
  (args) =>
    runCommand(args, (ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeValidate({ service, configPath: args.config, logger: ctx.logger });
      })
    )
).pipe(Command.withDescription("Validate a service configuration file"));

const generateCmd = Command.make(
  "generate",
  { ...globalOptions, service: serviceArg, config: configArg, outputDir },
  (args) =>
    runCommand(args, (ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeGenerate({
          service,
          configPath: args.config,
          outputDir: Option.getOrUndefined(args.outputDir),
          dryRun: args.dryRun,
          verbose: args.verbose,
          force: args.force,
          logger: ctx.logger,
        });
      })
    )
).pipe(Command.withDescription("Generate quadlet files from configuration"));

const diffCmd = Command.make(
  "diff",
  { ...globalOptions, service: serviceArg, config: configArg },
  (args) =>
    runCommand(args, (ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeDiff({
          service,
          configPath: args.config,
          verbose: args.verbose,
          dryRun: args.dryRun,
          force: args.force,
          logger: ctx.logger,
        });
      })
    )
).pipe(Command.withDescription("Show differences between config and installed files"));

const setupCmd = Command.make(
  "setup",
  { ...globalOptions, service: serviceArg, config: configArg },
  (args) =>
    runCommand(args, (ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeSetup({
          service,
          configPath: args.config,
          dryRun: args.dryRun,
          force: args.force,
          verbose: args.verbose,
          logger: ctx.logger,
          globalConfig: ctx.globalConfig,
        });
      })
    )
).pipe(Command.withDescription("Set up a service (create user, install quadlets, start)"));

const startCmd = Command.make(
  "start",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, (ctx) =>
      requireServiceOrAll(
        args.service,
        args.all,
        (service) =>
          executeStart({
            service,
            dryRun: args.dryRun,
            verbose: args.verbose,
            force: args.force,
            logger: ctx.logger,
          }),
        ctx.logger
      )
    )
).pipe(Command.withDescription("Start a service"));

const stopCmd = Command.make(
  "stop",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, (ctx) =>
      requireServiceOrAll(
        args.service,
        args.all,
        (service) =>
          executeStop({
            service,
            dryRun: args.dryRun,
            verbose: args.verbose,
            force: args.force,
            logger: ctx.logger,
          }),
        ctx.logger
      )
    )
).pipe(Command.withDescription("Stop a service"));

const restartCmd = Command.make(
  "restart",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, (ctx) =>
      requireServiceOrAll(
        args.service,
        args.all,
        (service) =>
          executeRestart({
            service,
            dryRun: args.dryRun,
            verbose: args.verbose,
            force: args.force,
            logger: ctx.logger,
          }),
        ctx.logger
      )
    )
).pipe(Command.withDescription("Restart a service"));

const reloadCmd = Command.make("reload", { ...globalOptions, service: serviceArg }, (args) =>
  runCommand(args, (ctx) =>
    Effect.gen(function* () {
      const service = yield* getService(args.service);
      yield* executeReload({
        service,
        dryRun: args.dryRun,
        verbose: args.verbose,
        force: args.force,
        logger: ctx.logger,
      });
    })
  )
).pipe(Command.withDescription("Reload a service configuration"));

const statusCmd = Command.make(
  "status",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, (ctx) =>
      requireServiceOrAll(
        args.service,
        args.all,
        (service) =>
          executeStatus({
            service,
            format: ctx.format,
            dryRun: args.dryRun,
            verbose: args.verbose,
            force: args.force,
            logger: ctx.logger,
          }),
        ctx.logger
      )
    )
).pipe(Command.withDescription("Show service status"));

const logsCmd = Command.make(
  "logs",
  { ...globalOptions, service: serviceArg, follow, lines, container },
  (args) =>
    runCommand(args, (ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeLogs({
          service,
          follow: args.follow,
          lines: args.lines,
          container: Option.getOrUndefined(args.container),
          dryRun: args.dryRun,
          verbose: args.verbose,
          force: args.force,
          logger: ctx.logger,
        });
      })
    )
).pipe(Command.withDescription("Show service logs"));

const updateCmd = Command.make(
  "update",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, (ctx) =>
      requireServiceOrAll(
        args.service,
        args.all,
        (service) =>
          executeUpdate({
            service,
            dryRun: args.dryRun,
            logger: ctx.logger,
          }),
        ctx.logger
      )
    )
).pipe(Command.withDescription("Check for and apply container image updates"));

const backupCmd = Command.make(
  "backup",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, (ctx) =>
      requireServiceOrAll(
        args.service,
        args.all,
        (service) =>
          executeBackup({
            service,
            dryRun: args.dryRun,
            format: ctx.format,
            verbose: args.verbose,
            force: args.force,
            logger: ctx.logger,
          }),
        ctx.logger
      )
    )
).pipe(Command.withDescription("Create a service data backup"));

const backupConfigCmd = Command.make(
  "backup-config",
  { ...globalOptions, service: optionalServiceArg, outputPath: optionalConfigArg, all: allFlag },
  (args) =>
    runCommand(args, (ctx) =>
      requireServiceOrAll(
        args.service,
        args.all,
        (service) =>
          executeBackupConfig({
            service,
            outputPath: Option.getOrUndefined(args.outputPath),
            dryRun: args.dryRun,
            format: ctx.format,
            logger: ctx.logger,
          }),
        ctx.logger
      )
    )
).pipe(Command.withDescription("Back up service configuration files"));

const restoreCmd = Command.make(
  "restore",
  { ...globalOptions, service: serviceArg, backupPath: backupPathArg },
  (args) =>
    runCommand(args, (ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeRestore({
          service,
          backupPath: args.backupPath,
          dryRun: args.dryRun,
          force: args.force,
          format: ctx.format,
          verbose: args.verbose,
          logger: ctx.logger,
        });
      })
    )
).pipe(Command.withDescription("Restore a service from a backup"));

const removeCmd = Command.make(
  "remove",
  { ...globalOptions, service: serviceArg, preserveData },
  (args) =>
    runCommand(args, (ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeRemove({
          service,
          dryRun: args.dryRun,
          force: args.force,
          preserveData: args.preserveData,
          logger: ctx.logger,
        });
      })
    )
).pipe(Command.withDescription("Remove a service and its user"));

// --- Secret subcommands ---

const secretShowCmd = Command.make(
  "show",
  { ...globalOptions, service: serviceArg, name: secretNameArg },
  (args) =>
    runCommand(args, (ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeSecretShow({
          service,
          secretName: args.name,
          logger: ctx.logger,
        });
      })
    )
).pipe(Command.withDescription("Show a secret value"));

const secretListCmd = Command.make("list", { ...globalOptions, service: serviceArg }, (args) =>
  runCommand(args, (ctx) =>
    Effect.gen(function* () {
      const service = yield* getService(args.service);
      yield* executeSecretList({
        service,
        format: ctx.format,
        logger: ctx.logger,
      });
    })
  )
).pipe(Command.withDescription("List all secrets for a service"));

const secretCmd = Command.make("secret").pipe(
  Command.withDescription("Manage service secrets"),
  Command.withSubcommands([secretShowCmd, secretListCmd])
);

// --- Root command ---

const divban = Command.make("divban").pipe(
  Command.withDescription("Unified Rootless Podman Service Manager"),
  Command.withSubcommands([
    validateCmd,
    generateCmd,
    diffCmd,
    setupCmd,
    startCmd,
    stopCmd,
    restartCmd,
    reloadCmd,
    statusCmd,
    logsCmd,
    updateCmd,
    backupCmd,
    backupConfigCmd,
    restoreCmd,
    removeCmd,
    secretCmd,
  ])
);

export const cli: (args: readonly string[]) => Effect.Effect<void, unknown, CliApp.Environment> =
  Command.run(divban, {
    name: "divban",
    version: DIVBAN_VERSION,
  });
