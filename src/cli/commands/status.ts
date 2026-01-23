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
import { loadServiceConfig } from "../../config/loader";
import { getServiceUsername } from "../../config/schema";
import type { DivbanEffectError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { toAbsolutePathEffect } from "../../lib/paths";
import type { ExistentialService } from "../../services/types";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import {
  createServiceLayer,
  findAndLoadConfig,
  getContextOptions,
  getDataDirFromConfig,
  resolvePrerequisites,
} from "./utils";

export interface StatusOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the status command.
 */
export const executeStatus = (options: StatusOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    // Get service user - check if configured first
    const username = yield* getServiceUsername(service.definition.name);
    const userResult = yield* Effect.either(getUserByName(username));

    type MatchResultType = Effect.Effect<void, DivbanEffectError>;
    return yield* Either.match(userResult, {
      onLeft: (): MatchResultType =>
        pipe(
          Match.value(args.format),
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
              logger.info(`Run 'divban ${service.definition.name} setup <config>' to set up.`);
            })
          ),
          Match.exhaustive
        ),
      onRight: (): MatchResultType =>
        Effect.gen(function* () {
          // Resolve prerequisites without config
          const prereqs = yield* resolvePrerequisites(service.definition.name, null);

          // Access service methods with proper config typing
          const status = yield* service.apply((s) =>
            Effect.gen(function* () {
              // Load config with typed schema (optional for status)
              const configResult = yield* Effect.either(
                pipe(
                  Match.value(args.configPath),
                  Match.when(undefined, () =>
                    findAndLoadConfig(service.definition.name, prereqs.user.homeDir, s.configSchema)
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

              return yield* s.status().pipe(Effect.provide(layer));
            })
          );

          yield* pipe(
            Match.value(args.format),
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
