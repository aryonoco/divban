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

import { Effect, Match, Option, pipe } from "effect";
import {
  type ConfigError,
  type DivbanEffectError,
  ErrorCode,
  GeneralError,
} from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { toAbsolutePathEffect } from "../../lib/paths";
import type { AbsolutePath } from "../../lib/types";
import type { ExistentialService } from "../../services/types";
import { createServiceLayer, loadConfigOrFallback, resolvePrerequisites } from "./utils";

export interface RestoreOptions {
  readonly service: ExistentialService;
  readonly backupPath: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly format: "pretty" | "json";
  readonly verbose: boolean;
  readonly logger: Logger;
}

interface RestoreContext {
  readonly service: ExistentialService;
  readonly logger: Logger;
  readonly backupPath: AbsolutePath;
}

const validateRestoreCapability = (
  service: ExistentialService
): Effect.Effect<void, GeneralError> =>
  Effect.if(service.definition.capabilities.hasRestore, {
    onTrue: (): Effect.Effect<void> => Effect.void,
    onFalse: (): Effect.Effect<never, GeneralError> =>
      Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `Service '${service.definition.name}' does not support restore`,
        })
      ),
  });

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
  Effect.if(force, {
    onTrue: (): Effect.Effect<Option.Option<AbsolutePath>, ConfigError> =>
      Effect.map(toAbsolutePathEffect(backupPath), Option.some),
    onFalse: (): Effect.Effect<never, GeneralError> => handleMissingForce(logger),
  });

/** Returns None for dry-run (already handled), Some(path) for real restore. */
const processBackupPath = (
  backupPath: string,
  dryRun: boolean,
  force: boolean,
  logger: Logger
): Effect.Effect<Option.Option<AbsolutePath>, GeneralError | ConfigError> =>
  Effect.if(dryRun, {
    onTrue: (): Effect.Effect<Option.Option<AbsolutePath>> =>
      Effect.map(handleDryRunRestore(backupPath, logger), () => Option.none<AbsolutePath>()),
    onFalse: (): Effect.Effect<Option.Option<AbsolutePath>, GeneralError | ConfigError> =>
      validateForceAndPath(backupPath, force, logger),
  });

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
        logger.info(`You may need to restart the service: divban restart ${serviceName}`);
      })
    ),
    Match.exhaustive
  );

const performRestore = (
  context: RestoreContext,
  restoreOptions: { readonly dryRun: boolean; readonly verbose: boolean; readonly force: boolean },
  format: "pretty" | "json"
): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, logger, backupPath } = context;
    logger.info(`Restoring ${service.definition.name} from: ${backupPath}`);

    const prereqs = yield* resolvePrerequisites(service.definition.name, null);

    yield* service.apply((s) =>
      Effect.gen(function* () {
        const { config, paths: updatedPaths } = yield* loadConfigOrFallback(
          service.definition.name,
          prereqs.user.homeDir,
          s.configSchema,
          prereqs
        );

        const layer = createServiceLayer(
          config,
          s.configTag,
          { ...prereqs, paths: updatedPaths },
          restoreOptions,
          logger
        );

        yield* pipe(
          Option.fromNullable(s.restore),
          Option.match({
            onNone: (): Effect.Effect<never, GeneralError> =>
              Effect.fail(
                new GeneralError({
                  code: ErrorCode.GENERAL_ERROR as 1,
                  message: `Service '${service.definition.name}' restore method not implemented`,
                })
              ),
            onSome: (restoreFn): Effect.Effect<void, DivbanEffectError> =>
              restoreFn(backupPath).pipe(Effect.provide(layer)),
          })
        );
      })
    );

    yield* formatRestoreResult(service.definition.name, format, logger);
  });

export const executeRestore = (options: RestoreOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, backupPath, dryRun, force, format, verbose, logger } = options;

    yield* validateRestoreCapability(service);
    const backupPathOption = yield* processBackupPath(backupPath, dryRun, force, logger);

    yield* Option.match(backupPathOption, {
      onNone: (): Effect.Effect<void, DivbanEffectError> => Effect.void,
      onSome: (validBackupPath): Effect.Effect<void, DivbanEffectError> =>
        performRestore(
          { service, logger, backupPath: validBackupPath },
          { dryRun, verbose, force },
          format
        ),
    });
  });
