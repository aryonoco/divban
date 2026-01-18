/**
 * Reload command - reload service configuration (if supported).
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

export interface ReloadOptions {
  service: Service;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the reload command.
 */
export const executeReload = async (
  options: ReloadOptions
): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

  // Check if service supports reload
  if (!service.definition.capabilities.hasReload || !service.reload) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Service '${service.definition.name}' does not support reload. Use 'restart' instead.`
      )
    );
  }

  // Get service user
  const usernameResult = getServiceUsername(service.definition.name);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  const userResult = await getUserByName(username);
  if (!userResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_NOT_FOUND,
        `Service user '${username}' not found. Run 'divban ${service.definition.name} setup' first.`
      )
    );
  }

  const { uid, homeDir } = userResult.value;
  const gid = uid as unknown as GroupId;

  // Resolve config
  const configResult = await resolveServiceConfig(service, homeDir);
  if (!configResult.ok) {
    return configResult;
  }

  // Build service context
  const ctx: ServiceContext = {
    config: configResult.value,
    logger,
    paths: {
      dataDir: (configResult.value as any).paths?.dataDir as AbsolutePath,
      quadletDir: `${homeDir}/.config/containers/systemd` as AbsolutePath,
      configDir: `${homeDir}/.config/divban` as AbsolutePath,
    },
    user: {
      name: username,
      uid,
      gid,
    },
  };

  if (args.dryRun) {
    logger.info("Dry run - would reload configuration");
    return Ok(undefined);
  }

  logger.info(`Reloading ${service.definition.name} configuration...`);

  const reloadResult = await service.reload(ctx);

  if (!reloadResult.ok) {
    return reloadResult;
  }

  logger.success("Configuration reloaded successfully");
  return Ok(undefined);
};
