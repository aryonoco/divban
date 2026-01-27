// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Service data backup orchestration. Delegates to service-specific
 * backup implementations since each service has different data
 * structures (SQLite, uploads directory, etc.). Validates capability
 * support before attempting - not all services implement backup.
 */

import { Effect, Match, Option, pipe } from "effect";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { BackupResult, ExistentialService } from "../../services/types";
import {
  createServiceLayer,
  formatBytes,
  loadConfigOrFallback,
  resolvePrerequisites,
} from "./utils";

export interface BackupOptions {
  readonly service: ExistentialService;
  readonly dryRun: boolean;
  readonly format: "pretty" | "json";
  readonly verbose: boolean;
  readonly force: boolean;
  readonly logger: Logger;
}

export const executeBackup = (options: BackupOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, dryRun, format, verbose, force, logger } = options;

    // Check if service supports backup (must be done before context resolution)
    return yield* Effect.if(service.definition.capabilities.hasBackup, {
      onTrue: (): Effect.Effect<void, DivbanEffectError> =>
        Effect.if(dryRun, {
          onTrue: (): Effect.Effect<void> =>
            Effect.sync(() => {
              logger.info("Dry run - would create backup");
            }),
          onFalse: (): Effect.Effect<void, DivbanEffectError> =>
            Effect.gen(function* () {
              logger.info(`Creating backup for ${service.definition.name}...`);

              // Resolve prerequisites without config
              const prereqs = yield* resolvePrerequisites(service.definition.name, null);

              const result = yield* service.apply((s) =>
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
                    { dryRun, verbose, force },
                    logger
                  );

                  return yield* Option.match(Option.fromNullable(s.backup), {
                    onNone: (): Effect.Effect<never, GeneralError> =>
                      Effect.fail(
                        new GeneralError({
                          code: ErrorCode.GENERAL_ERROR as 1,
                          message: `Service '${service.definition.name}' backup method not implemented`,
                        })
                      ),
                    onSome: (backupFn): Effect.Effect<BackupResult, DivbanEffectError> =>
                      backupFn().pipe(Effect.provide(layer)),
                  });
                })
              );

              yield* pipe(
                Match.value(format),
                Match.when("json", () =>
                  Effect.sync(() =>
                    logger.info(
                      JSON.stringify({
                        path: result.path,
                        size: result.size,
                        timestamp: result.timestamp,
                      })
                    )
                  )
                ),
                Match.when("pretty", () =>
                  Effect.sync(() => {
                    logger.success(`Backup created: ${result.path}`);
                    logger.info(`Size: ${formatBytes(result.size)}`);
                  })
                ),
                Match.exhaustive
              );
            }),
        }),
      onFalse: (): Effect.Effect<never, GeneralError> =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `Service '${service.definition.name}' does not support backup`,
          })
        ),
    });
  });
