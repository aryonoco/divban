// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Service health overview. Queries systemd for each container's
 * active state, showing running/stopped status per container.
 * Works even when service isn't configured yet - gracefully
 * reports "not set up" instead of failing.
 */

import { Effect, Either, Match, Option, pipe } from "effect";
import { getServiceUsername } from "../../config/schema";
import type { DivbanEffectError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { ExistentialService } from "../../services/types";
import { getUserByName } from "../../system/user";
import {
  createServiceLayer,
  findAndLoadConfig,
  getDataDirFromConfig,
  resolvePrerequisites,
} from "./utils";

export interface StatusOptions {
  readonly service: ExistentialService;
  readonly format: "pretty" | "json";
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly force: boolean;
  readonly logger: Logger;
}

export const executeStatus = (options: StatusOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, format, dryRun, verbose, force, logger } = options;

    const username = yield* getServiceUsername(service.definition.name);
    const userResult = yield* Effect.either(getUserByName(username));

    type MatchResultType = Effect.Effect<void, DivbanEffectError>;
    return yield* Either.match(userResult, {
      onLeft: (): MatchResultType =>
        pipe(
          Match.value(format),
          Match.when("json", () =>
            Effect.sync(() =>
              logger.raw(
                JSON.stringify({
                  service: service.definition.name,
                  status: "not_configured",
                  running: false,
                })
              )
            )
          ),
          Match.when("pretty", () =>
            Effect.sync(() => {
              logger.warn(`Service '${service.definition.name}' is not configured.`);
              logger.info(`Run 'divban setup ${service.definition.name} <config>' to set up.`);
            })
          ),
          Match.exhaustive
        ),
      onRight: (): MatchResultType =>
        Effect.gen(function* () {
          const prereqs = yield* resolvePrerequisites(service.definition.name, null);

          const status = yield* service.apply((s) =>
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

              return yield* s.status().pipe(Effect.provide(layer));
            })
          );

          yield* pipe(
            Match.value(format),
            Match.when("json", () =>
              Effect.sync(() =>
                logger.raw(
                  JSON.stringify({
                    service: service.definition.name,
                    running: status.running,
                    containers: status.containers,
                  })
                )
              )
            ),
            Match.when("pretty", () =>
              Effect.gen(function* () {
                const overallStatus = pipe(
                  Match.value(status.running),
                  Match.when(true, () => "running"),
                  Match.when(false, () => "stopped"),
                  Match.exhaustive
                );
                const statusColor = pipe(
                  Match.value(status.running),
                  Match.when(true, () => "\x1b[32m"),
                  Match.when(false, () => "\x1b[31m"),
                  Match.exhaustive
                );
                const reset = "\x1b[0m";

                logger.raw(`${service.definition.name}: ${statusColor}${overallStatus}${reset}`);

                yield* pipe(
                  Match.value(status.containers.length > 0),
                  Match.when(true, () =>
                    Effect.gen(function* () {
                      logger.raw("");
                      logger.raw("Containers:");

                      // Pure: format container lines
                      const containerLines = status.containers.map((container) => {
                        const containerStatusColor = pipe(
                          Match.value(container.status.status === "running"),
                          Match.when(true, () => "\x1b[32m"),
                          Match.when(false, () => "\x1b[31m"),
                          Match.exhaustive
                        );
                        const healthStr = pipe(
                          Option.fromNullable(container.health),
                          Option.map((h) => ` (${h.health})`),
                          Option.getOrElse(() => "")
                        );
                        return `  ${container.name}: ${containerStatusColor}${container.status.status}${reset}${healthStr}`;
                      });

                      // Single side effect: log all lines
                      yield* Effect.forEach(
                        containerLines,
                        (line) => Effect.sync(() => logger.raw(line)),
                        { discard: true }
                      );
                    })
                  ),
                  Match.when(false, () => Effect.void),
                  Match.exhaustive
                );
              })
            ),
            Match.exhaustive
          );
        }),
    });
  });
