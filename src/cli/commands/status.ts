// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based status command - show service status.
 * Uses Layer.provide pattern for dependency injection.
 */

import { Effect, Option, pipe } from "effect";
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

    if (userResult._tag === "Left") {
      if (args.format === "json") {
        logger.raw(
          JSON.stringify({
            service: service.definition.name,
            status: "not_configured",
            running: false,
          })
        );
      } else {
        logger.warn(`Service '${service.definition.name}' is not configured.`);
        logger.info(`Run 'divban ${service.definition.name} setup <config>' to set up.`);
      }
      return;
    }

    // Resolve prerequisites without config
    const prereqs = yield* resolvePrerequisites(service.definition.name, null);

    // Enter existential for typed config loading and method calls
    const status = yield* service.apply((s) =>
      Effect.gen(function* () {
        // Load config with typed schema (optional for status)
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

        return yield* s.status().pipe(Effect.provide(layer));
      })
    );

    if (args.format === "json") {
      logger.raw(
        JSON.stringify({
          service: service.definition.name,
          running: status.running,
          containers: status.containers,
        })
      );
    } else {
      const overallStatus = status.running ? "running" : "stopped";
      const statusColor = status.running ? "\x1b[32m" : "\x1b[31m";
      const reset = "\x1b[0m";

      logger.raw(`${service.definition.name}: ${statusColor}${overallStatus}${reset}`);

      if (status.containers.length > 0) {
        logger.raw("");
        logger.raw("Containers:");

        // Pure: format container lines
        const containerLines = status.containers.map((container) => {
          const containerStatusColor =
            container.status.status === "running" ? "\x1b[32m" : "\x1b[31m";
          const healthStr = pipe(
            Option.fromNullable(container.health),
            Option.map((h) => ` (${h.health})`),
            Option.getOrElse(() => "")
          );
          return `  ${container.name}: ${containerStatusColor}${container.status.status}${reset}${healthStr}`;
        });

        // Single side effect: log all lines
        yield* Effect.forEach(containerLines, (line) => Effect.sync(() => logger.raw(line)), {
          discard: true,
        });
      }
    }
  });
