// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Restore command - restore from a backup.
 */

import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { userConfigDir, userDataDir, userQuadletDir } from "../../lib/paths";
import { Err, Ok, type Result, mapErr } from "../../lib/result";
import type { AbsolutePath } from "../../lib/types";
import { userIdToGroupId } from "../../lib/types";
import type { AnyService, ServiceContext } from "../../services/types";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import {
  detectSystemCapabilities,
  getContextOptions,
  getDataDirFromConfig,
  resolveServiceConfig,
} from "./utils";

export interface RestoreOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the restore command.
 */
export const executeRestore = async (
  options: RestoreOptions
): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

  // Check if service supports restore
  if (!(service.definition.capabilities.hasRestore && service.restore)) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Service '${service.definition.name}' does not support restore`
      )
    );
  }

  // Check backup path is provided
  if (!args.backupPath) {
    return Err(
      new DivbanError(ErrorCode.INVALID_ARGS, "Backup path is required for restore command")
    );
  }

  // Get service user
  const usernameResult = getServiceUsername(service.definition.name);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  const userResult = await getUserByName(username);
  const userMapped = mapErr(
    userResult,
    () =>
      new DivbanError(
        ErrorCode.SERVICE_NOT_FOUND,
        `Service user '${username}' not found. Run 'divban ${service.definition.name} setup' first.`
      )
  );
  if (!userMapped.ok) {
    return userMapped;
  }

  const { uid, homeDir } = userMapped.value;
  const gid = userIdToGroupId(uid);

  // Resolve config
  const configResult = await resolveServiceConfig(service, homeDir);
  if (!configResult.ok) {
    return configResult;
  }

  // Build service context
  const dataDir = getDataDirFromConfig(configResult.value, userDataDir(homeDir));

  const ctx: ServiceContext<unknown> = {
    config: configResult.value,
    logger,
    paths: {
      dataDir,
      quadletDir: userQuadletDir(homeDir),
      configDir: userConfigDir(homeDir),
    },
    user: {
      name: username,
      uid,
      gid,
    },
    options: getContextOptions(args),
    system: await detectSystemCapabilities(),
  };

  if (args.dryRun) {
    logger.info(`Dry run - would restore from: ${args.backupPath}`);
    return Ok(undefined);
  }

  // Warn about data overwrite
  if (!args.force) {
    logger.warn("This will overwrite existing data!");
    logger.warn("Use --force to skip this warning.");
    // In a real CLI we'd prompt for confirmation here
    // For now, require --force flag
    return Err(
      new DivbanError(ErrorCode.GENERAL_ERROR, "Restore requires --force flag for safety")
    );
  }

  logger.info(`Restoring ${service.definition.name} from: ${args.backupPath}`);

  const restoreResult = await service.restore(ctx, args.backupPath as AbsolutePath);

  if (!restoreResult.ok) {
    return restoreResult;
  }

  if (args.format === "json") {
    logger.info(JSON.stringify({ success: true, service: service.definition.name }));
  } else {
    logger.success("Restore completed successfully");
    logger.info(`You may need to restart the service: divban ${service.definition.name} restart`);
  }

  return Ok(undefined);
};
