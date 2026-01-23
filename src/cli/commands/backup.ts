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

import { Effect, Either, Match, Option, pipe } from "effect";
import { loadServiceConfig } from "../../config/loader";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { toAbsolutePathEffect } from "../../lib/paths";
import type { BackupResult, ExistentialService } from "../../services/types";
import type { ParsedArgs } from "../parser";
import {
  createServiceLayer,
  findAndLoadConfig,
  formatBytes,
  getContextOptions,
  getDataDirFromConfig,
  resolvePrerequisites,
} from "./utils";

export interface BackupOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

export const executeBackup = (options: BackupOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    // Check if service supports backup (must be done before context resolution)
    return yield* pipe(
      Match.value(service.definition.capabilities.hasBackup),
      Match.when(false, () =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `Service '${service.definition.name}' does not support backup`,
          })
        )
      ),
      Match.when(true, () =>
        pipe(
          Match.value(args.dryRun),
          Match.when(true, () =>
            Effect.sync(() => {
              logger.info("Dry run - would create backup");
            })
          ),
          Match.when(false, () =>
            Effect.gen(function* () {
              logger.info(`Creating backup for ${service.definition.name}...`);

              // Resolve prerequisites without config
              const prereqs = yield* resolvePrerequisites(service.definition.name, null);

              // Access service methods with proper config typing
              const result = yield* service.apply((s) =>
                Effect.gen(function* () {
                  // Load config with typed schema (optional for backup)
                  const configResult = yield* Effect.either(
                    pipe(
                      Match.value(args.configPath),
                      Match.when(undefined, () =>
                        findAndLoadConfig(
                          service.definition.name,
                          prereqs.user.homeDir,
                          s.configSchema
                        )
                      ),
                      Match.orElse((configPath) =>
                        Effect.flatMap(toAbsolutePathEffect(configPath), (path) =>
                          loadServiceConfig(path, s.configSchema)
                        )
                      )
                    )
                  );

                  // Use empty config if not found
                  type ConfigType = Parameters<(typeof s.configTag)["of"]>[0];
                  type PathsType = typeof prereqs.paths;
                  const config = Either.match(configResult, {
                    onLeft: (): ConfigType => ({}) as ConfigType,
                    onRight: (cfg): ConfigType => cfg,
                  });

                  // Update paths with config dataDir if available
                  const updatedPaths = Either.match(configResult, {
                    onLeft: (): PathsType => prereqs.paths,
                    onRight: (cfg): PathsType => ({
                      ...prereqs.paths,
                      dataDir: getDataDirFromConfig(cfg, prereqs.paths.dataDir),
                    }),
                  });

                  const layer = createServiceLayer(
                    config,
                    s.configTag,
                    { ...prereqs, paths: updatedPaths },
                    getContextOptions(args),
                    logger
                  );

                  return yield* pipe(
                    Option.fromNullable(s.backup),
                    Option.match({
                      onNone: (): Effect.Effect<never, GeneralError> =>
                        Effect.fail(
                          new GeneralError({
                            code: ErrorCode.GENERAL_ERROR as 1,
                            message: `Service '${service.definition.name}' backup method not implemented`,
                          })
                        ),
                      onSome: (backupFn): Effect.Effect<BackupResult, DivbanEffectError> =>
                        backupFn().pipe(Effect.provide(layer)),
                    })
                  );
                })
              );

              yield* pipe(
                Match.value(args.format),
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
            })
          ),
          Match.orElse(() => Effect.void)
        )
      ),
      Match.exhaustive
    );
  });
