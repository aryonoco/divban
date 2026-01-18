/**
 * Update command - update container images.
 */

import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result } from "../../lib/result";
import type { Service } from "../../services/types";
import { exec } from "../../system/exec";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { resolveServiceConfig } from "./utils";

export interface UpdateOptions {
  service: Service;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the update command.
 */
export const executeUpdate = async (options: UpdateOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

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

  // Resolve config
  const configResult = await resolveServiceConfig(service, homeDir);
  if (!configResult.ok) {
    return configResult;
  }

  logger.info(`Updating ${service.definition.name} containers...`);

  if (args.dryRun) {
    logger.info("Dry run - would check for updates and restart if needed");
    return Ok(undefined);
  }

  // Use systemctl to trigger auto-update
  // This relies on podman-auto-update.service
  const updateResult = await exec(
    [
      "sudo",
      "-u",
      username,
      `XDG_RUNTIME_DIR=/run/user/${uid}`,
      "podman",
      "auto-update",
      "--dry-run",
    ],
    { captureStdout: true, captureStderr: true }
  );

  if (!updateResult.ok) {
    return Err(
      new DivbanError(ErrorCode.GENERAL_ERROR, "Failed to check for updates", updateResult.error)
    );
  }

  const output = updateResult.value.stdout;

  if (output.includes("false")) {
    logger.info("No updates available");
    return Ok(undefined);
  }

  if (output.includes("true") || output.includes("pending")) {
    logger.info("Updates available. Applying...");

    // Apply updates
    const applyResult = await exec(
      ["sudo", "-u", username, `XDG_RUNTIME_DIR=/run/user/${uid}`, "podman", "auto-update"],
      { captureStdout: true, captureStderr: true }
    );

    if (!applyResult.ok || applyResult.value.exitCode !== 0) {
      const stderr = applyResult.ok ? applyResult.value.stderr : "";
      return Err(new DivbanError(ErrorCode.GENERAL_ERROR, `Failed to apply updates: ${stderr}`));
    }

    logger.success("Updates applied successfully");
  } else {
    logger.info("All images are up to date");
  }

  return Ok(undefined);
};
