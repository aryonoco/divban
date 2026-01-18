/**
 * Status command - show service status.
 */

import type { Logger } from "../../lib/logger";
import type { Service, ServiceContext } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { DivbanError, ErrorCode } from "../../lib/errors";
import { Err, Ok, type Result } from "../../lib/result";
import type { AbsolutePath, GroupId } from "../../lib/types";
import { getServiceUsername } from "../../config/schema";
import { getUserByName } from "../../system/user";
import { resolveServiceConfig } from "./utils";

export interface StatusOptions {
  service: Service;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the status command.
 */
export const executeStatus = async (
  options: StatusOptions
): Promise<Result<void, DivbanError>> => {
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
      console.log(
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
  };

  const statusResult = await service.status(ctx);

  if (!statusResult.ok) {
    return statusResult;
  }

  const status = statusResult.value;

  if (args.format === "json") {
    console.log(
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

    console.log(`${service.definition.name}: ${statusColor}${overallStatus}${reset}`);

    if (status.containers.length > 0) {
      console.log("");
      console.log("Containers:");
      for (const container of status.containers) {
        const containerStatus = container.status === "running" ? "\x1b[32m" : "\x1b[31m";
        const healthStr = container.health ? ` (${container.health})` : "";
        console.log(`  ${container.name}: ${containerStatus}${container.status}${reset}${healthStr}`);
      }
    }
  }

  return Ok(undefined);
};
