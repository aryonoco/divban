// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based status command - show service status.
 */

import { Effect, Option } from "effect";
import { getServiceUsername } from "../../config/schema";
import type { DivbanEffectError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { buildServicePaths, userDataDir } from "../../lib/paths";
import { userIdToGroupId } from "../../lib/types";
import type { AnyServiceEffect, ServiceContext } from "../../services/types";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { detectSystemCapabilities, getContextOptions, resolveServiceConfig } from "./utils";

export interface StatusOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the status command.
 */
export const executeStatus = (options: StatusOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    // Get service user
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

    const { uid, homeDir } = userResult.right;
    const gid = userIdToGroupId(uid);

    // Resolve config (may fail if not found)
    const configResult = yield* Effect.either(resolveServiceConfig(service, homeDir));

    // Build service context
    const dataDir = userDataDir(homeDir);
    const paths = buildServicePaths(homeDir, dataDir);

    const system = yield* detectSystemCapabilities();

    const ctx: ServiceContext<unknown> = {
      config: configResult._tag === "Right" ? configResult.right : {},
      logger,
      paths,
      user: {
        name: username,
        uid,
        gid,
      },
      options: getContextOptions(args),
      system,
    };

    const status = yield* service.status(ctx);

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
        for (const container of status.containers) {
          const containerStatusColor =
            container.status.status === "running" ? "\x1b[32m" : "\x1b[31m";
          const healthOpt = Option.fromNullable(container.health);
          const healthStr = Option.isSome(healthOpt) ? ` (${healthOpt.value.health})` : "";
          logger.raw(
            `  ${container.name}: ${containerStatusColor}${container.status.status}${reset}${healthStr}`
          );
        }
      }
    }
  });
