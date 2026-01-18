// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Status command - show service status.
 */

import { getServiceUsername } from "../../config/schema";
import type { DivbanError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Ok, type Result } from "../../lib/result";
import type { AbsolutePath, GroupId } from "../../lib/types";
import type { Service, ServiceContext } from "../../services/types";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { getContextOptions, resolveServiceConfig } from "./utils";

export interface StatusOptions {
  service: Service;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the status command.
 */
export const executeStatus = async (options: StatusOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

  // Get service user
  const usernameResult = getServiceUsername(service.definition.name);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  const userResult = await getUserByName(username);
  if (!userResult.ok) {
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
    return Ok(undefined);
  }

  const { uid, homeDir } = userResult.value;
  const gid = uid as unknown as GroupId;

  // Resolve config (may fail if not found)
  const configResult = await resolveServiceConfig(service, homeDir);

  // Build service context
  const ctx: ServiceContext = {
    config: configResult.ok ? configResult.value : {},
    logger,
    paths: {
      dataDir: `${homeDir}/data` as AbsolutePath,
      quadletDir: `${homeDir}/.config/containers/systemd` as AbsolutePath,
      configDir: `${homeDir}/.config/divban` as AbsolutePath,
    },
    user: {
      name: username,
      uid,
      gid,
    },
    options: getContextOptions(args),
  };

  const statusResult = await service.status(ctx);

  if (!statusResult.ok) {
    return statusResult;
  }

  const status = statusResult.value;

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
        const containerStatus = container.status === "running" ? "\x1b[32m" : "\x1b[31m";
        const healthStr = container.health ? ` (${container.health})` : "";
        logger.raw(
          `  ${container.name}: ${containerStatus}${container.status}${reset}${healthStr}`
        );
      }
    }
  }

  return Ok(undefined);
};
