// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Hot configuration reload without restart. Some services (Caddy)
 * support reloading configs without dropping connections. Validates
 * capability first - services without reload support get clear error
 * directing users to use restart instead.
 */

import { Effect, Either, Match, Option, pipe } from "effect";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { ExistentialService } from "../../services/types";
import {
  createServiceLayer,
  findAndLoadConfig,
  getDataDirFromConfig,
  resolvePrerequisites,
} from "./utils";

export interface ReloadOptions {
  readonly service: ExistentialService;
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly force: boolean;
  readonly logger: Logger;
}

export const executeReload = (options: ReloadOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, dryRun, verbose, force, logger } = options;

    return yield* pipe(
      Match.value(service.definition.capabilities.hasReload),
      Match.when(false, () =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `Service '${service.definition.name}' does not support reload. Use 'restart' instead.`,
          })
        )
      ),
      Match.when(true, () =>
        pipe(
          Match.value(dryRun),
          Match.when(true, () =>
            Effect.sync(() => {
              logger.info("Dry run - would reload configuration");
            })
          ),
          Match.when(false, () =>
            Effect.gen(function* () {
              logger.info(`Reloading ${service.definition.name} configuration...`);

              const prereqs = yield* resolvePrerequisites(service.definition.name, null);

              yield* service.apply((s) =>
                Effect.gen(function* () {
                  const configResult = yield* Effect.either(
                    findAndLoadConfig(service.definition.name, prereqs.user.homeDir, s.configSchema)
                  );

                  type ConfigType = Parameters<(typeof s.configTag)["of"]>[0];
                  type PathsType = typeof prereqs.paths;
                  const config = Either.match(configResult, {
                    onLeft: (): ConfigType => ({}) as ConfigType,
                    onRight: (cfg): ConfigType => cfg,
                  });

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
                    { dryRun, verbose, force },
                    logger
                  );

                  yield* pipe(
                    Option.fromNullable(s.reload),
                    Option.match({
                      onNone: (): Effect.Effect<never, GeneralError> =>
                        Effect.fail(
                          new GeneralError({
                            code: ErrorCode.GENERAL_ERROR as 1,
                            message: `Service '${service.definition.name}' reload method not implemented`,
                          })
                        ),
                      onSome: (reloadFn): Effect.Effect<void, DivbanEffectError> =>
                        reloadFn().pipe(Effect.provide(layer)),
                    })
                  );
                })
              );

              logger.success("Configuration reloaded successfully");
            })
          ),
          Match.orElse(() => Effect.void)
        )
      ),
      Match.exhaustive
    );
  });
