// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Setup command - full service setup (generate, install, enable).
 */

import { loadServiceConfig } from "../../config/loader";
import { getUserAllocationSettings } from "../../config/merge";
import type { GlobalConfig } from "../../config/schema";
import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import {
  configFilePath,
  toAbsolutePath,
  userConfigDir,
  userDataDir,
  userQuadletDir,
} from "../../lib/paths";
import { Err, Ok, type Result, asyncFlatMapResult } from "../../lib/result";
import { userIdToGroupId } from "../../lib/types";
import type { AnyService, ServiceContext } from "../../services/types";
import { chown, ensureServiceDirectories } from "../../system/directories";
import { copyFile } from "../../system/fs";
import { enableLinger } from "../../system/linger";
import { ensureUnprivilegedPorts, isUnprivilegedPortEnabled } from "../../system/sysctl";
import { createServiceUser, getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { detectSystemCapabilities, getContextOptions, getDataDirFromConfig } from "./utils";

export interface SetupOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
  globalConfig: GlobalConfig;
}

/**
 * Execute the setup command.
 */
export const executeSetup = async (options: SetupOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger, globalConfig } = options;
  const configPath = args.configPath;

  // Get UID allocation settings from global config
  const uidSettings = getUserAllocationSettings(globalConfig);

  if (!configPath) {
    return Err(
      new DivbanError(ErrorCode.INVALID_ARGS, "Config path is required for setup command")
    );
  }

  logger.info(`Setting up ${service.definition.name}...`);

  // Chain: validate path → load config
  const configResult = await asyncFlatMapResult(toAbsolutePath(configPath), (validPath) =>
    loadServiceConfig(validPath, service.definition.configSchema)
  );

  if (!configResult.ok) {
    return configResult;
  }

  // Store validated path for file copy later
  const validConfigPath = toAbsolutePath(configPath);
  if (!validConfigPath.ok) {
    return validConfigPath; // Already validated above, but TypeScript needs this
  }

  // Get service username
  const usernameResult = getServiceUsername(service.definition.name);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  if (args.dryRun) {
    logger.info("Dry run mode - showing what would be done:");
    if (service.definition.name === "caddy") {
      logger.info("  1. Configure privileged port binding (sysctl)");
      logger.info(`  2. Create user: ${username}`);
      logger.info(`  3. Enable linger for: ${username}`);
      logger.info("  4. Create data directories");
      logger.info("  5. Copy configuration file");
      logger.info("  6. Generate and install quadlet files");
      logger.info("  7. Reload systemd daemon");
      logger.info("  8. Enable services");
    } else {
      logger.info(`  1. Create user: ${username}`);
      logger.info(`  2. Enable linger for: ${username}`);
      logger.info("  3. Create data directories");
      logger.info("  4. Copy configuration file");
      logger.info("  5. Generate and install quadlet files");
      logger.info("  6. Reload systemd daemon");
      logger.info("  7. Enable services");
    }
    return Ok(undefined);
  }

  // For caddy, check if privileged port binding needs to be configured
  const needsSysctl = service.definition.name === "caddy" && !(await isUnprivilegedPortEnabled());
  const totalSteps = needsSysctl ? 8 : 7;
  let currentStep = 0;

  // Check if running as root (required for user creation and sysctl)
  if (process.getuid?.() !== 0) {
    // Check if user already exists
    const existingUser = await getUserByName(username);
    if (!existingUser.ok) {
      return Err(
        new DivbanError(
          ErrorCode.ROOT_REQUIRED,
          "Root privileges required to create service user. Run with sudo."
        )
      );
    }
    // For caddy, also check if sysctl needs root
    if (needsSysctl) {
      return Err(
        new DivbanError(
          ErrorCode.ROOT_REQUIRED,
          "Root privileges required to configure privileged port binding. Run with sudo."
        )
      );
    }
  }

  // Step 1 (caddy only): Configure privileged port binding
  if (needsSysctl) {
    currentStep++;
    logger.step(currentStep, totalSteps, "Configuring privileged port binding...");
    const sysctlResult = await ensureUnprivilegedPorts(70, service.definition.name);
    if (!sysctlResult.ok) {
      return sysctlResult;
    }
  }

  // Step: Create service user (or get existing)
  currentStep++;
  logger.step(currentStep, totalSteps, `Creating service user: ${username}...`);
  const userResult = await createServiceUser(service.definition.name, uidSettings);
  if (!userResult.ok) {
    return userResult;
  }
  const { uid, homeDir } = userResult.value;
  const gid = userIdToGroupId(uid);

  // Step: Enable linger
  currentStep++;
  logger.step(currentStep, totalSteps, "Enabling user linger...");
  const lingerResult = await enableLinger(username, uid);
  if (!lingerResult.ok) {
    return lingerResult;
  }

  // Step: Create service directories
  currentStep++;
  logger.step(currentStep, totalSteps, "Creating service directories...");
  const dataDir = getDataDirFromConfig(configResult.value, userDataDir(homeDir));
  const dirsResult = await ensureServiceDirectories(dataDir, homeDir, { uid, gid });
  if (!dirsResult.ok) {
    return dirsResult;
  }

  // Step: Copy config file to service user's config directory
  currentStep++;
  logger.step(currentStep, totalSteps, "Copying configuration file...");
  const configDestPath = configFilePath(userConfigDir(homeDir), `${service.definition.name}.toml`);
  const copyResult = await copyFile(validConfigPath.value, configDestPath);
  if (!copyResult.ok) {
    return copyResult;
  }
  const chownResult = await chown(configDestPath, { uid, gid });
  if (!chownResult.ok) {
    return chownResult;
  }

  // Build service context
  const ctx: ServiceContext<unknown> = {
    config: configResult.value,
    logger,
    paths: {
      dataDir,
      quadletDir: userQuadletDir(homeDir),
      configDir: userConfigDir(homeDir),
      homeDir,
    },
    user: {
      name: username,
      uid,
      gid,
    },
    options: getContextOptions(args),
    system: await detectSystemCapabilities(),
  };

  // Step: Delegate to service's setup method (handles remaining steps)
  currentStep++;
  logger.step(currentStep, totalSteps, "Running service-specific setup...");
  const setupResult = await service.setup(ctx);
  if (!setupResult.ok) {
    return setupResult;
  }

  logger.success(`${service.definition.name} setup completed successfully`);
  logger.info("Next steps:");
  logger.info(`  Start service: divban ${service.definition.name} start`);
  logger.info(`  Check status:  divban ${service.definition.name} status`);
  logger.info(`  View logs:     divban ${service.definition.name} logs --follow`);

  return Ok(undefined);
};
