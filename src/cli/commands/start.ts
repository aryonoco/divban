// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based start command - start a service.
 * Uses Layer.provide pattern for dependency injection.
 */

import { Effect } from "effect";
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

/**
 * Execute the start command.
 */
export const executeStart = (options: StartOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    // Resolve prerequisites without config
    const prereqs = yield* resolvePrerequisites(service.definition.name, null);

    // Enter existential for typed config loading and method calls
    yield* service.apply((s) =>
      Effect.gen(function* () {
        // Load config with typed schema (optional for start)
        const configResult = yield* Effect.either(
          args.configPath !== undefined
            ? Effect.flatMap(toAbsolutePathEffect(args.configPath), (path) =>
                loadServiceConfig(path, s.configSchema)
              )
            : findAndLoadConfig(service.definition.name, prereqs.user.homeDir, s.configSchema)
        );

        // Use empty config if not found
        const config =
          configResult._tag === "Right"
            ? configResult.right
            : ({} as Parameters<(typeof s.configTag)["of"]>[0]);

        // Update paths with config dataDir if available
        const updatedPaths =
          configResult._tag === "Right"
            ? {
                ...prereqs.paths,
                dataDir: getDataDirFromConfig(configResult.right, prereqs.paths.dataDir),
              }
            : prereqs.paths;

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
