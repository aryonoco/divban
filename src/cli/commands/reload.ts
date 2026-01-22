// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based reload command - reload service configuration (if supported).
 */

import { Effect } from "effect";
import { loadServiceConfig } from "../../config/loader";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
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

export interface ReloadOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the reload command.
 */
export const executeReload = (options: ReloadOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    // Check if service supports reload
    if (!service.definition.capabilities.hasReload) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `Service '${service.definition.name}' does not support reload. Use 'restart' instead.`,
        })
      );
    }

    if (args.dryRun) {
      logger.info("Dry run - would reload configuration");
      return;
    }

    logger.info(`Reloading ${service.definition.name} configuration...`);

    // Resolve prerequisites without config
    const prereqs = yield* resolvePrerequisites(service.definition.name, null);

    // Enter existential for typed config loading and method calls
    yield* service.apply((s) =>
      Effect.gen(function* () {
        // Load config with typed schema (optional for reload)
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

        // reload is optional, use non-null assertion after capability check
        // biome-ignore lint/style/noNonNullAssertion: capability check above ensures reload exists
        yield* s.reload!().pipe(Effect.provide(layer));
      })
    );

    logger.success("Configuration reloaded successfully");
  });
