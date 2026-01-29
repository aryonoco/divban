// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * CLI entry point. The runCommand wrapper centralizes service initialization,
 * context resolution, and error display to avoid duplication across commands.
 */

import { Command } from "@effect/cli";
import type { CliApp } from "@effect/cli/CliApp";
import { Effect, Either, Match, Option, pipe } from "effect";
import { DebugModeConfig, LogFormatOptionConfig, LogLevelOptionConfig } from "../config/env";
import type { LogFormat, LogLevel } from "../config/field-values";
import { loadGlobalConfig } from "../config/loader";
import { resolve } from "../config/resolve";
import type { GlobalConfig } from "../config/schema";
import { DivbanLoggerLive } from "../lib/effect-logger";
import { type ConfigError, type DivbanEffectError, ErrorCode, GeneralError } from "../lib/errors";
import { logFail } from "../lib/log";
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

/** Resolved runtime context for commands. Merges CLI args > env vars > config file (priority order). */
interface CommandContext {
  readonly globalConfig: GlobalConfig;
  readonly format: LogFormat;
  readonly logLevel: LogLevel;
  readonly logFormat: LogFormat;
}

// Context resolution

const resolveGlobalConfigPath = (
  globals: GlobalOptions
): Effect.Effect<AbsolutePath | undefined, ConfigError> =>
  Option.match(globals.globalConfig, {
    onNone: (): Effect.Effect<AbsolutePath | undefined, ConfigError> => Effect.succeed(undefined),
    onSome: (path): Effect.Effect<AbsolutePath | undefined, ConfigError> =>
      toAbsolutePathEffect(path),
  });

/** Resolves configuration from CLI, environment, and config file with CLI taking precedence. */
const resolveContext = (globals: GlobalOptions): Effect.Effect<CommandContext, unknown> =>
  Effect.gen(function* () {
    const validatedPath = yield* resolveGlobalConfigPath(globals);
    const globalConfig = yield* loadGlobalConfig(validatedPath);

    const envLogLevel = yield* LogLevelOptionConfig;
    const envLogFormat = yield* LogFormatOptionConfig;
    const envDebug = yield* DebugModeConfig;

    const logLevel: LogLevel = pipe(
      Match.value(globals.verbose || envDebug),
      Match.when(true, (): LogLevel => "debug"),
      Match.when(
        false,
        (): LogLevel =>
          resolve({
            cli: globals.logLevel,
            env: envLogLevel,
            toml: globalConfig.logging.level,
          })
      ),
      Match.exhaustive
    );

    const cliFormat: Option.Option<LogFormat> = effectiveFormat(globals);
    const logFormat: LogFormat = resolve({
      cli: cliFormat,
      env: envLogFormat,
      toml: globalConfig.logging.format,
    });

    const format: LogFormat = pipe(
      cliFormat,
      Option.getOrElse((): LogFormat => logFormat)
    );

    return { globalConfig, format, logLevel, logFormat };
  });

// Error display

/** Type guard for error display routing. Divban errors have exit codes; unknown errors get generic handling. */
const isDivbanError = (err: unknown): err is DivbanEffectError =>
  typeof err === "object" && err !== null && "_tag" in err && "code" in err && "message" in err;

/** Formats error for terminal output with optional color. Sync because called in exit path. */
const displayError = (err: unknown, format: LogFormat): void => {
  if (!isDivbanError(err)) {
    return;
  }
  pipe(
    Match.value(format),
    Match.when("json", () =>
      process.stdout.write(`${JSON.stringify({ error: err.message, code: err.code })}\n`)
    ),
    Match.when("pretty", () => {
      const red = Bun.color("red", "ansi");
      const prefix = red ? `${red}✗\x1b[0m` : "✗";
      process.stderr.write(`${prefix} ${err.message}\n`);
    }),
    Match.exhaustive
  );
};

// Command runner

/** Centralizes init, context, and error handling so each command stays focused on its logic. */
const runCommand = (
  globals: GlobalOptions,
  commandName: string,
  handler: (ctx: CommandContext) => Effect.Effect<void, unknown>
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    yield* Effect.promise(() => initializeServices());
    const ctx = yield* resolveContext(globals);
    yield* pipe(
      handler(ctx),
      Effect.withLogSpan(`command-${commandName}`),
      Effect.tapError((err) => Effect.sync(() => displayError(err, ctx.format))),
      Effect.provide(
        DivbanLoggerLive({
          level: ctx.logLevel,
          format: ctx.logFormat,
        })
      )
    );
  });

// All-services support

const runServiceForAll = (
  serviceDef: ServiceDefinition,
  runSingle: (service: ExistentialService) => Effect.Effect<void, unknown>
): Effect.Effect<Option.Option<number>, never> =>
  Effect.gen(function* () {
    const serviceResult = yield* Effect.either(getService(serviceDef.name));
    return yield* Either.match(serviceResult, {
      onLeft: (err): Effect.Effect<Option.Option<number>, never> =>
        Effect.gen(function* () {
          yield* Effect.logWarning(`Skipping ${serviceDef.name}: ${err.message}`);
          return Option.none<number>();
        }),
      onRight: (service): Effect.Effect<Option.Option<number>, never> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`\n=== ${serviceDef.name} ===`);
          const result = yield* Effect.either(runSingle(service));
          return yield* Either.match(result, {
            onLeft: (e): Effect.Effect<Option.Option<number>, never> =>
              Effect.gen(function* () {
                if (!isDivbanError(e)) {
                  yield* logFail(`${serviceDef.name}: Unknown error`);
                  return Option.some(1);
                }
                yield* logFail(`${serviceDef.name}: ${e.message}`);
                return Option.some(e.code);
              }),
            onRight: (): Effect.Effect<Option.Option<number>, never> =>
              Effect.succeed(Option.none()),
          });
        }),
    });
  });

/** Runs operation on all services, accumulating errors. Continues despite individual failures for maximum progress. */
const runOnAllServices = (
  runSingle: (service: ExistentialService) => Effect.Effect<void, unknown>
): Effect.Effect<void, GeneralError> =>
  Effect.gen(function* () {
    const services = listServices();

    yield* Effect.if(services.length === 0, {
      onTrue: (): Effect.Effect<void, never> => Effect.logWarning("No services registered"),
      onFalse: (): Effect.Effect<void, GeneralError> =>
        Effect.gen(function* () {
          const firstError = yield* Effect.reduce(
            services,
            Option.none<number>(),
            (acc, serviceDef) =>
              pipe(
                runServiceForAll(serviceDef, runSingle),
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
  runSingle: (service: ExistentialService) => Effect.Effect<void, unknown>
): Effect.Effect<void, unknown> =>
  Effect.if(all, {
    onTrue: (): Effect.Effect<void, GeneralError> => runOnAllServices(runSingle),
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

// Subcommand definitions

const validateCmd = Command.make(
  "validate",
  { ...globalOptions, service: serviceArg, config: configArg },
  (args) =>
    runCommand(args, "validate", (_ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeValidate({ service, configPath: args.config });
      })
    )
).pipe(Command.withDescription("Validate a service configuration file"));

const generateCmd = Command.make(
  "generate",
  { ...globalOptions, service: serviceArg, config: configArg, outputDir },
  (args) =>
    runCommand(args, "generate", (_ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeGenerate({
          service,
          configPath: args.config,
          outputDir: Option.getOrUndefined(args.outputDir),
          dryRun: args.dryRun,
          verbose: args.verbose,
          force: args.force,
        });
      })
    )
).pipe(Command.withDescription("Generate quadlet files from configuration"));

const diffCmd = Command.make(
  "diff",
  { ...globalOptions, service: serviceArg, config: configArg },
  (args) =>
    runCommand(args, "diff", (_ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeDiff({
          service,
          configPath: args.config,
          verbose: args.verbose,
          dryRun: args.dryRun,
          force: args.force,
        });
      })
    )
).pipe(Command.withDescription("Show differences between config and installed files"));

const setupCmd = Command.make(
  "setup",
  { ...globalOptions, service: serviceArg, config: configArg },
  (args) =>
    runCommand(args, "setup", (ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeSetup({
          service,
          configPath: args.config,
          dryRun: args.dryRun,
          force: args.force,
          verbose: args.verbose,
          globalConfig: ctx.globalConfig,
        });
      })
    )
).pipe(Command.withDescription("Set up a service (create user, install quadlets, start)"));

const startCmd = Command.make(
  "start",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, "start", (_ctx) =>
      requireServiceOrAll(args.service, args.all, (service) =>
        executeStart({
          service,
          dryRun: args.dryRun,
          verbose: args.verbose,
          force: args.force,
        })
      )
    )
).pipe(Command.withDescription("Start a service"));

const stopCmd = Command.make(
  "stop",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, "stop", (_ctx) =>
      requireServiceOrAll(args.service, args.all, (service) =>
        executeStop({
          service,
          dryRun: args.dryRun,
          verbose: args.verbose,
          force: args.force,
        })
      )
    )
).pipe(Command.withDescription("Stop a service"));

const restartCmd = Command.make(
  "restart",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, "restart", (_ctx) =>
      requireServiceOrAll(args.service, args.all, (service) =>
        executeRestart({
          service,
          dryRun: args.dryRun,
          verbose: args.verbose,
          force: args.force,
        })
      )
    )
).pipe(Command.withDescription("Restart a service"));

const reloadCmd = Command.make("reload", { ...globalOptions, service: serviceArg }, (args) =>
  runCommand(args, "reload", (_ctx) =>
    Effect.gen(function* () {
      const service = yield* getService(args.service);
      yield* executeReload({
        service,
        dryRun: args.dryRun,
        verbose: args.verbose,
        force: args.force,
      });
    })
  )
).pipe(Command.withDescription("Reload a service configuration"));

const statusCmd = Command.make(
  "status",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, "status", (ctx) =>
      requireServiceOrAll(args.service, args.all, (service) =>
        executeStatus({
          service,
          format: ctx.format,
          dryRun: args.dryRun,
          verbose: args.verbose,
          force: args.force,
        })
      )
    )
).pipe(Command.withDescription("Show service status"));

const logsCmd = Command.make(
  "logs",
  { ...globalOptions, service: serviceArg, follow, lines, container },
  (args) =>
    runCommand(args, "logs", (_ctx) =>
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
        });
      })
    )
).pipe(Command.withDescription("Show service logs"));

const updateCmd = Command.make(
  "update",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, "update", (_ctx) =>
      requireServiceOrAll(args.service, args.all, (service) =>
        executeUpdate({
          service,
          dryRun: args.dryRun,
        })
      )
    )
).pipe(Command.withDescription("Check for and apply container image updates"));

const backupCmd = Command.make(
  "backup",
  { ...globalOptions, service: optionalServiceArg, all: allFlag },
  (args) =>
    runCommand(args, "backup", (ctx) =>
      requireServiceOrAll(args.service, args.all, (service) =>
        executeBackup({
          service,
          dryRun: args.dryRun,
          format: ctx.format,
          verbose: args.verbose,
          force: args.force,
        })
      )
    )
).pipe(Command.withDescription("Create a service data backup"));

const backupConfigCmd = Command.make(
  "backup-config",
  { ...globalOptions, service: optionalServiceArg, outputPath: optionalConfigArg, all: allFlag },
  (args) =>
    runCommand(args, "backup-config", (ctx) =>
      requireServiceOrAll(args.service, args.all, (service) =>
        executeBackupConfig({
          service,
          outputPath: Option.getOrUndefined(args.outputPath),
          dryRun: args.dryRun,
          format: ctx.format,
        })
      )
    )
).pipe(Command.withDescription("Back up service configuration files"));

const restoreCmd = Command.make(
  "restore",
  { ...globalOptions, service: serviceArg, backupPath: backupPathArg },
  (args) =>
    runCommand(args, "restore", (ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeRestore({
          service,
          backupPath: args.backupPath,
          dryRun: args.dryRun,
          force: args.force,
          format: ctx.format,
          verbose: args.verbose,
        });
      })
    )
).pipe(Command.withDescription("Restore a service from a backup"));

const removeCmd = Command.make(
  "remove",
  { ...globalOptions, service: serviceArg, preserveData },
  (args) =>
    runCommand(args, "remove", (_ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeRemove({
          service,
          dryRun: args.dryRun,
          force: args.force,
          preserveData: args.preserveData,
        });
      })
    )
).pipe(Command.withDescription("Remove a service and its user"));

// Secret subcommands

const secretShowCmd = Command.make(
  "show",
  { ...globalOptions, service: serviceArg, name: secretNameArg },
  (args) =>
    runCommand(args, "secret-show", (_ctx) =>
      Effect.gen(function* () {
        const service = yield* getService(args.service);
        yield* executeSecretShow({
          service,
          secretName: args.name,
        });
      })
    )
).pipe(Command.withDescription("Show a secret value"));

const secretListCmd = Command.make("list", { ...globalOptions, service: serviceArg }, (args) =>
  runCommand(args, "secret-list", (ctx) =>
    Effect.gen(function* () {
      const service = yield* getService(args.service);
      yield* executeSecretList({
        service,
        format: ctx.format,
      });
    })
  )
).pipe(Command.withDescription("List all secrets for a service"));

const secretCmd = Command.make("secret").pipe(
  Command.withDescription("Manage service secrets"),
  Command.withSubcommands([secretShowCmd, secretListCmd])
);

// Root command

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
