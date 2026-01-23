// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Service startup with dependency ordering. Multi-container stacks
 * start in topological order (databases before apps). Triggers
 * systemd daemon-reload first to pick up any quadlet changes,
 * then starts via systemctl --user.
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

export interface StartOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

export const executeStart = (options: StartOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    const prereqs = yield* resolvePrerequisites(service.definition.name, null);

    yield* service.apply((s) =>
      Effect.gen(function* () {
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

        // Config is optional for start - service may have been set up with defaults
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
          getContextOptions(args),
          logger
        );
        yield* s.start().pipe(Effect.provide(layer));
      })
    );
  });
