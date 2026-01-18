/**
 * Setup command - full service setup (generate, install, enable).
 */

import { loadServiceConfig } from "../../config/loader";
import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result } from "../../lib/result";
import type { AbsolutePath, GroupId } from "../../lib/types";
import type { Service, ServiceContext } from "../../services/types";
import { ensureServiceDirectories } from "../../system/directories";
import { enableLinger } from "../../system/linger";
import { createServiceUser, getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { getContextOptions, getDataDirFromConfig } from "./utils";

export interface SetupOptions {
  service: Service;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the setup command.
 */
export const executeSetup = async (options: SetupOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;
  const configPath = args.configPath;

  if (!configPath) {
    return Err(
      new DivbanError(ErrorCode.INVALID_ARGS, "Config path is required for setup command")
    );
  }

  logger.info(`Setting up ${service.definition.name}...`);

  // Load and validate config
  const configResult = await loadServiceConfig(
    configPath as AbsolutePath,
    service.definition.configSchema
  );

  if (!configResult.ok) {
    return configResult;
  }

  // Get service username
  const usernameResult = getServiceUsername(service.definition.name);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  if (args.dryRun) {
    logger.info("Dry run mode - showing what would be done:");
    logger.info(`  1. Create user: ${username}`);
    logger.info(`  2. Enable linger for: ${username}`);
    logger.info("  3. Create data directories");
    logger.info("  4. Generate and install quadlet files");
    logger.info("  5. Reload systemd daemon");
    logger.info("  6. Enable services");
    return Ok(undefined);
  }

  // Check if running as root (required for user creation)
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
  }

  // Step 1: Create service user (or get existing)
  logger.step(1, 6, `Creating service user: ${username}...`);
  const userResult = await createServiceUser(service.definition.name);
  if (!userResult.ok) {
    return userResult;
  }
  const { uid, homeDir } = userResult.value;
  // GID is typically same as UID for service users
  const gid = uid as unknown as GroupId;

  // Step 2: Enable linger
  logger.step(2, 6, "Enabling user linger...");
  const lingerResult = await enableLinger(username);
  if (!lingerResult.ok) {
    return lingerResult;
  }

  // Step 3: Create service directories
  logger.step(3, 6, "Creating service directories...");
  const dataDir = getDataDirFromConfig(configResult.value, `${homeDir}/data` as AbsolutePath);
  const dirsResult = await ensureServiceDirectories(dataDir, homeDir, { uid, gid });
  if (!dirsResult.ok) {
    return dirsResult;
  }

  // Build service context
  const ctx: ServiceContext = {
    config: configResult.value,
    logger,
    paths: {
      dataDir,
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

  // Step 4-6: Delegate to service's setup method
  logger.step(4, 6, "Running service-specific setup...");
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
