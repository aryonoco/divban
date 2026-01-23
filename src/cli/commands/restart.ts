// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Service restart with dependency awareness. For multi-container
 * stacks, respects topological order - stops dependents first, then
 * restarts in dependency order. Single-container services use direct
 * systemctl restart.
 */

import { Effect, Either, Match, pipe } from "effect";
import { loadServiceConfig } from "../../config/loader";
import type { DivbanEffectError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { toAbsolutePathEffect } from "../../lib/paths";
import type { ExistentialService } from "../../services/types";
import type { ParsedArgs } from "../parser";
import {
  createServiceLayer,
  findAndLoadConfig,
  getContextOptions,
  getDataDirFromConfig,
  resolvePrerequisites,
} from "./utils";

export interface RestartOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the restart command.
 */
export const executeRestart = (options: RestartOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    // Resolve prerequisites without config
    const prereqs = yield* resolvePrerequisites(service.definition.name, null);

    // Access service methods with proper config typing
    yield* service.apply((s) =>
      Effect.gen(function* () {
        // Load config with typed schema (optional for restart)
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
        yield* s.restart().pipe(Effect.provide(layer));
      })
    );
  });
