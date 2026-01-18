// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Reload command - reload service configuration (if supported).
 */

import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { userConfigDir, userDataDir, userQuadletDir } from "../../lib/paths";
import { Err, Ok, type Result } from "../../lib/result";
import { userIdToGroupId } from "../../lib/types";
import type { AnyService, ServiceContext } from "../../services/types";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { getContextOptions, getDataDirFromConfig, resolveServiceConfig } from "./utils";

export interface ReloadOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the reload command.
 */
export const executeReload = async (options: ReloadOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

  // Check if service supports reload
  if (!(service.definition.capabilities.hasReload && service.reload)) {
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
