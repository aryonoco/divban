// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Backup restoration with validation. Verifies archive metadata
 * matches the target service before extracting, preventing
 * accidental cross-service restores. Delegates extraction to
 * service-specific handlers that know their data layout.
 */

import { Effect, Either, Match, Option, type Schema, pipe } from "effect";
import { loadServiceConfig } from "../../config/loader";
import {
  type ConfigError,
  type DivbanEffectError,
  ErrorCode,
  GeneralError,
} from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { toAbsolutePathEffect } from "../../lib/paths";
import type { AbsolutePath, ServiceName } from "../../lib/types";
import type { ExistentialService } from "../../services/types";
import type { ParsedArgs } from "../parser";
import {
  type Prerequisites,
  createServiceLayer,
  findAndLoadConfig,
  getContextOptions,
  getDataDirFromConfig,
  resolvePrerequisites,
} from "./utils";

export interface RestoreOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

interface RestoreContext {
  readonly service: ExistentialService;
  readonly logger: Logger;
  readonly backupPath: AbsolutePath;
}

const validateRestoreCapability = (
  service: ExistentialService
): Effect.Effect<void, GeneralError> =>
  pipe(
    Match.value(service.definition.capabilities.hasRestore),
    Match.when(true, () => Effect.void),
    Match.when(false, () =>
      Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `Service '${service.definition.name}' does not support restore`,
        })
      )
    ),
    Match.exhaustive
  );

const handleDryRunRestore = (backupPath: string, logger: Logger): Effect.Effect<void> =>
  Effect.sync(() => {
    logger.info(`Dry run - would restore from: ${backupPath}`);
  });

const handleMissingForce = (logger: Logger): Effect.Effect<never, GeneralError> => {
  logger.warn("This will overwrite existing data!");
  logger.warn("Use --force to skip this warning.");
  return Effect.fail(
    new GeneralError({
      code: ErrorCode.GENERAL_ERROR as 1,
      message: "Restore requires --force flag for safety",
    })
  );
};

const validateForceAndPath = (
  backupPath: string,
  force: boolean,
  logger: Logger
): Effect.Effect<Option.Option<AbsolutePath>, GeneralError | ConfigError> =>
  pipe(
    Match.value(force),
    Match.when(true, () => Effect.map(toAbsolutePathEffect(backupPath), Option.some)),
    Match.when(false, () => handleMissingForce(logger)),
    Match.exhaustive
  );

const processBackupPath = (
  backupPath: string,
  args: ParsedArgs,
  logger: Logger
): Effect.Effect<Option.Option<AbsolutePath>, GeneralError | ConfigError> =>
  pipe(
    Match.value(args.dryRun),
    Match.when(true, () =>
      Effect.map(handleDryRunRestore(backupPath, logger), () => Option.none<AbsolutePath>())
    ),
    Match.when(false, () => validateForceAndPath(backupPath, args.force, logger)),
    Match.exhaustive
  );

/** Returns None for dry-run (already handled), Some(path) for real restore. */
const validateRestoreArgs = (
  args: ParsedArgs,
  logger: Logger
): Effect.Effect<Option.Option<AbsolutePath>, GeneralError | ConfigError> =>
  pipe(
    Option.fromNullable(args.backupPath),
    Option.match({
      onNone: (): Effect.Effect<Option.Option<AbsolutePath>, GeneralError | ConfigError> =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.INVALID_ARGS as 2,
            message: "Backup path is required for restore command",
          })
        ),
      onSome: (
        backupPath
      ): Effect.Effect<Option.Option<AbsolutePath>, GeneralError | ConfigError> =>
        processBackupPath(backupPath, args, logger),
    })
  );

const formatRestoreResult = (
  serviceName: string,
  format: "json" | "pretty",
  logger: Logger
): Effect.Effect<void> =>
  pipe(
    Match.value(format),
    Match.when("json", () =>
      Effect.sync(() => logger.info(JSON.stringify({ success: true, service: serviceName })))
    ),
    Match.when("pretty", () =>
      Effect.sync(() => {
        logger.success("Restore completed successfully");
        logger.info(`You may need to restart the service: divban ${serviceName} restart`);
      })
    ),
    Match.exhaustive
  );

const loadConfigForRestore = <C>(
  configPath: string | undefined,
  serviceName: ServiceName,
  homeDir: AbsolutePath,
  // biome-ignore lint/suspicious/noExplicitAny: Schema input varies per service - validated at runtime
  configSchema: Schema.Schema<C, any, never>
): Effect.Effect<C, DivbanEffectError> =>
  pipe(
    Option.fromNullable(configPath),
    Option.match({
      onNone: (): Effect.Effect<C, DivbanEffectError> =>
        findAndLoadConfig(serviceName, homeDir, configSchema),
      onSome: (path): Effect.Effect<C, DivbanEffectError> =>
        Effect.flatMap(toAbsolutePathEffect(path), (absPath) =>
          loadServiceConfig(absPath, configSchema)
        ),
    })
  );

const buildConfigAndPaths = <C extends object>(
  configResult: Either.Either<C, DivbanEffectError>,
  prereqs: Prerequisites,
  configTag: { of: (config: C) => C }
): { config: C; paths: Prerequisites["paths"] } => {
  type ConfigType = Parameters<(typeof configTag)["of"]>[0];
  type PathsType = typeof prereqs.paths;

  const config = Either.match(configResult, {
    onLeft: (): ConfigType => ({}) as ConfigType,
    onRight: (cfg): ConfigType => cfg,
  });

  const paths = Either.match(configResult, {
    onLeft: (): PathsType => prereqs.paths,
    onRight: (cfg): PathsType => ({
      ...prereqs.paths,
      dataDir: getDataDirFromConfig(cfg, prereqs.paths.dataDir),
    }),
  });

  return { config, paths };
};

const performRestore = (
  context: RestoreContext,
  args: ParsedArgs
): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, logger, backupPath } = context;
    logger.info(`Restoring ${service.definition.name} from: ${backupPath}`);

    const prereqs = yield* resolvePrerequisites(service.definition.name, null);

    yield* service.apply((s) =>
      Effect.gen(function* () {
        const configResult = yield* Effect.either(
          loadConfigForRestore(
            args.configPath,
            service.definition.name,
            prereqs.user.homeDir,
            s.configSchema
          )
        );

        const { config, paths: updatedPaths } = buildConfigAndPaths(
          configResult,
          prereqs,
          s.configTag
        );

        const layer = createServiceLayer(
          config,
          s.configTag,
          { ...prereqs, paths: updatedPaths },
          getContextOptions(args),
          logger
        );

        // biome-ignore lint/style/noNonNullAssertion: capability check ensures restore exists
        yield* s.restore!(backupPath).pipe(Effect.provide(layer));
      })
    );

    yield* formatRestoreResult(service.definition.name, args.format, logger);
  });

export const executeRestore = (options: RestoreOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    yield* validateRestoreCapability(service);
    const backupPathOption = yield* validateRestoreArgs(args, logger);

    yield* Option.match(backupPathOption, {
      onNone: (): Effect.Effect<void, DivbanEffectError> => Effect.void,
      onSome: (backupPath): Effect.Effect<void, DivbanEffectError> =>
        performRestore({ service, logger, backupPath }, args),
    });
  });
