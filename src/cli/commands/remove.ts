// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Remove command - completely remove a service.
 */

import { getServiceDataDir, getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result } from "../../lib/result";
import type { AbsolutePath } from "../../lib/types";
import type { AnyService } from "../../services/types";
import { removeDirectory } from "../../system/directories";
import { exec, execAsUser } from "../../system/exec";
import { directoryExists } from "../../system/fs";
import { disableLinger } from "../../system/linger";
import { userExists } from "../../system/uid-allocator";
import { deleteServiceUser, getUserByName, requireRoot } from "../../system/user";
import type { ParsedArgs } from "../parser";

export interface RemoveOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the remove command.
 */
export const executeRemove = async (options: RemoveOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;
  const serviceName = service.definition.name;

  // Require root
  const rootResult = requireRoot();
  if (!rootResult.ok) {
    return rootResult;
  }

  // Get service username
  const usernameResult = getServiceUsername(serviceName);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  // Check if user exists
  if (!(await userExists(username))) {
    logger.warn(`Service user '${username}' does not exist. Nothing to remove.`);
    return Ok(undefined);
  }

  // Get data directory
  const dataDirResult = getServiceDataDir(serviceName);
  if (!dataDirResult.ok) {
    return dataDirResult;
  }
  const dataDir = dataDirResult.value;

  // Get user info (need uid for dry-run output and operations)
  const userResult = await getUserByName(username);
  if (!userResult.ok) {
    return userResult;
  }
  const { uid, homeDir } = userResult.value;

  // Dry-run mode
  if (args.dryRun) {
    logger.info("Dry-run mode - showing what would be done:");
    logger.info(`  1. Stop all containers for ${username}`);
    logger.info("  2. Remove all podman containers, volumes, networks");
    logger.info(`  3. Disable linger for ${username}`);
    logger.info(`  4. Stop systemd user service (user@${uid}.service)`);
    logger.info(`  5. Remove container storage for ${username}`);
    logger.info(`  6. Kill all processes owned by ${username}`);
    logger.info(`  7. Delete user ${username} (and home directory)`);
    if (args.preserveData) {
      logger.info(`  8. Preserve data directory ${dataDir}`);
    } else {
      logger.info(`  8. Remove data directory ${dataDir}`);
    }
    return Ok(undefined);
  }

  // Require --force
  if (!args.force) {
    logger.warn(`This will permanently remove ${serviceName} and delete user ${username}.`);
    return Err(new DivbanError(ErrorCode.GENERAL_ERROR, "Use --force to confirm removal"));
  }

  const totalSteps = args.preserveData ? 7 : 8;

  // Step 1: Stop all containers
  logger.step(1, totalSteps, "Stopping containers...");
  await execAsUser(username, uid, ["podman", "stop", "--all", "-t", "10"], {
    captureStdout: true,
    captureStderr: true,
  });

  // Step 2: Remove podman resources
  logger.step(2, totalSteps, "Removing containers, volumes, and networks...");
  await cleanupPodmanResources(username, uid);

  // Step 3: Disable linger
  logger.step(3, totalSteps, "Disabling linger...");
  const lingerResult = await disableLinger(username);
  if (!lingerResult.ok) {
    logger.warn(`Failed to disable linger: ${lingerResult.error.message}`);
  }

  // Step 4: Stop systemd user service
  logger.step(4, totalSteps, "Stopping systemd user service...");
  await stopUserService(uid);

  // Step 5: Remove container storage (volumes, images, etc.)
  logger.step(5, totalSteps, "Removing container storage...");
  await cleanupContainerStorage(homeDir, logger);

  // Step 6: Kill any remaining user processes
  logger.step(6, totalSteps, "Killing user processes...");
  await killUserProcesses(uid);

  // Step 7: Delete user (also removes home directory with quadlet files)
  logger.step(7, totalSteps, "Deleting service user...");
  const deleteResult = await deleteServiceUser(serviceName);
  if (!deleteResult.ok) {
    return deleteResult;
  }

  // Step 8: Remove data directory (unless --preserve-data)
  if (!args.preserveData) {
    logger.step(8, totalSteps, "Removing data directory...");
    const rmResult = await removeDirectory(dataDir, true);
    if (!rmResult.ok) {
      logger.warn(`Failed to remove data directory: ${rmResult.error.message}`);
    }
  }

  logger.success(`Service ${serviceName} removed successfully`);
  return Ok(undefined);
};

/**
 * Stop the systemd user service for a user.
 * This must be done before deleting the user to avoid "user is currently used by process" errors.
 */
const stopUserService = async (uid: number): Promise<void> => {
  // Stop the user@{uid}.service - this terminates all user processes
  await exec(["systemctl", "stop", `user@${uid}.service`], {
    captureStdout: true,
    captureStderr: true,
  });

  // Give systemd a moment to clean up
  await Bun.sleep(500);
};

/**
 * Clean up all podman resources for a user.
 * Continues on errors (graceful degradation).
 */
const cleanupPodmanResources = async (username: string, uid: number): Promise<void> => {
  // Remove all containers
  await execAsUser(username, uid, ["podman", "rm", "--all", "--force"], {
    captureStdout: true,
    captureStderr: true,
  });

  // Remove all volumes
  await execAsUser(username, uid, ["podman", "volume", "rm", "--all", "--force"], {
    captureStdout: true,
    captureStderr: true,
  });

  // List and remove networks (except podman default)
  const networksResult = await execAsUser(
    username,
    uid,
    ["podman", "network", "ls", "--format", "{{.Name}}"],
    { captureStdout: true, captureStderr: true }
  );

  if (networksResult.ok && networksResult.value.stdout) {
    const networks = networksResult.value.stdout
      .split("\n")
      .map((n) => n.trim())
      .filter((n) => n && n !== "podman");

    for (const network of networks) {
      await execAsUser(username, uid, ["podman", "network", "rm", network], {
        captureStdout: true,
        captureStderr: true,
      });
    }
  }
};

/**
 * Remove all container storage for a user.
 * This ensures volumes and images are completely removed even if podman commands fail.
 * Idempotent: succeeds if directory doesn't exist.
 */
const cleanupContainerStorage = async (homeDir: AbsolutePath, logger: Logger): Promise<void> => {
  const storageDir = `${homeDir}/.local/share/containers/storage` as AbsolutePath;

  // Check if directory exists before attempting removal
  if (!(await directoryExists(storageDir))) {
    return;
  }

  const result = await removeDirectory(storageDir, true);
  if (!result.ok) {
    logger.warn(`Failed to remove container storage: ${result.error.message}`);
  }
};

/**
 * Kill all processes belonging to a user.
 * This ensures user deletion won't fail with "user is currently used by process".
 * Idempotent: succeeds if no processes exist (pkill returns 1 when no match).
 */
const killUserProcesses = async (uid: number): Promise<void> => {
  // pkill -U sends SIGTERM to all processes owned by the user
  // Exit code 1 means no processes matched - that's fine
  await exec(["pkill", "-U", String(uid)], {
    captureStdout: true,
    captureStderr: true,
  });

  // Give processes time to terminate gracefully
  await Bun.sleep(500);

  // Force kill any remaining processes with SIGKILL
  // Exit code 1 means no processes matched - that's fine
  await exec(["pkill", "-9", "-U", String(uid)], {
    captureStdout: true,
    captureStderr: true,
  });

  // Brief pause before continuing
  await Bun.sleep(200);
};
