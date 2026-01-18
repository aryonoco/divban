/**
 * Backup command - create a service backup.
 */

import type { Logger } from "../../lib/logger";
import type { Service, ServiceContext } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { DivbanError, ErrorCode } from "../../lib/errors";
import { Err, Ok, type Result } from "../../lib/result";
import type { AbsolutePath, GroupId } from "../../lib/types";
import { getServiceUsername } from "../../config/schema";
import { getUserByName } from "../../system/user";
import { resolveServiceConfig, formatBytes } from "./utils";

export interface BackupOptions {
  service: Service;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the backup command.
 */
export const executeBackup = async (
  options: BackupOptions
): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

  // Check if service supports backup
  if (!service.definition.capabilities.hasBackup || !service.backup) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Service '${service.definition.name}' does not support backup`
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
    logger.info("Dry run - would create backup");
    return Ok(undefined);
  }

  logger.info(`Creating backup for ${service.definition.name}...`);

  const backupResult = await service.backup(ctx);

  if (!backupResult.ok) {
    return backupResult;
  }

  const result = backupResult.value;

  if (args.format === "json") {
    console.log(
      JSON.stringify({
        service: service.definition.name,
        path: result.path,
        size: result.size,
        timestamp: result.timestamp.toISOString(),
      })
    );
  } else {
    logger.success(`Backup created: ${result.path}`);
    logger.info(`Size: ${formatBytes(result.size)}`);
  }

  return Ok(undefined);
};
