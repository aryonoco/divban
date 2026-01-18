// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Backup command - create a service backup.
 */

import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result } from "../../lib/result";
import type { AbsolutePath, GroupId } from "../../lib/types";
import type { Service, ServiceContext } from "../../services/types";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import {
  formatBytes,
  getContextOptions,
  getDataDirFromConfig,
  resolveServiceConfig,
} from "./utils";

export interface BackupOptions {
  service: Service;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the backup command.
 */
export const executeBackup = async (options: BackupOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

  // Check if service supports backup
  if (!(service.definition.capabilities.hasBackup && service.backup)) {
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
      dataDir: getDataDirFromConfig(configResult.value, `${homeDir}/data` as AbsolutePath),
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
    // JSON output handled by caller
    logger.info(
      JSON.stringify({ path: result.path, size: result.size, timestamp: result.timestamp })
    );
  } else {
    logger.success(`Backup created: ${result.path}`);
    logger.info(`Size: ${formatBytes(result.size)}`);
  }

  return Ok(undefined);
};
