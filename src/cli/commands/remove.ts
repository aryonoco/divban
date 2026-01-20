// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based remove command - completely remove a service.
 */

import { Effect } from "effect";
import { getServiceDataDir, getServiceUsername } from "../../config/schema";
import { ErrorCode, GeneralError, type ServiceError, type SystemError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { AbsolutePath } from "../../lib/types";
import type { AnyServiceEffect } from "../../services/types";
import { removeDirectory } from "../../system/directories";
import { exec, execAsUser } from "../../system/exec";
import { directoryExists } from "../../system/fs";
import { disableLinger } from "../../system/linger";
import { userExists } from "../../system/uid-allocator";
import { deleteServiceUser, getUserByName, requireRoot } from "../../system/user";
import type { ParsedArgs } from "../parser";

export interface RemoveOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the remove command.
 */
export const executeRemove = (
  options: RemoveOptions
): Effect.Effect<void, GeneralError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const serviceName = service.definition.name;

    // Require root
    yield* requireRoot();

    // Get service username
    const username = yield* getServiceUsername(serviceName);

    // Check if user exists
    if (!(yield* userExists(username))) {
      logger.warn(`Service user '${username}' does not exist. Nothing to remove.`);
      return;
    }

    // Get data directory
    const dataDir = yield* getServiceDataDir(serviceName);

    // Get user info (need uid for dry-run output and operations)
    const { uid, homeDir } = yield* getUserByName(username);

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
      return;
    }

    // Require --force
    if (!args.force) {
      logger.warn(`This will permanently remove ${serviceName} and delete user ${username}.`);
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: "Use --force to confirm removal",
        })
      );
    }

    const totalSteps = args.preserveData ? 7 : 8;

    // Step 1: Stop all containers
    logger.step(1, totalSteps, "Stopping containers...");
    yield* Effect.ignore(
      execAsUser(username, uid, ["podman", "stop", "--all", "-t", "10"], {
        captureStdout: true,
        captureStderr: true,
      })
    );

    // Step 2: Remove podman resources
    logger.step(2, totalSteps, "Removing containers, volumes, and networks...");
    yield* cleanupPodmanResources(username, uid);

    // Step 3: Disable linger
    logger.step(3, totalSteps, "Disabling linger...");
    const lingerResult = yield* Effect.either(disableLinger(username));
    if (lingerResult._tag === "Left") {
      logger.warn(`Failed to disable linger: ${lingerResult.left.message}`);
    }

    // Step 4: Stop systemd user service
    logger.step(4, totalSteps, "Stopping systemd user service...");
    yield* stopUserService(uid as unknown as number);

    // Step 5: Remove container storage (volumes, images, etc.)
    logger.step(5, totalSteps, "Removing container storage...");
    yield* cleanupContainerStorage(homeDir, logger);

    // Step 6: Kill any remaining user processes
    logger.step(6, totalSteps, "Killing user processes...");
    yield* killUserProcesses(uid as unknown as number);

    // Step 7: Delete user (also removes home directory with quadlet files)
    logger.step(7, totalSteps, "Deleting service user...");
    yield* deleteServiceUser(serviceName);

    // Step 8: Remove data directory (unless --preserve-data)
    if (!args.preserveData) {
      logger.step(8, totalSteps, "Removing data directory...");
      const rmResult = yield* Effect.either(removeDirectory(dataDir, true));
      if (rmResult._tag === "Left") {
        logger.warn(`Failed to remove data directory: ${rmResult.left.message}`);
      }
    }

    logger.success(`Service ${serviceName} removed successfully`);
  });

/**
 * Stop the systemd user service for a user.
 */
const stopUserService = (uid: number): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* Effect.ignore(
      exec(["systemctl", "stop", `user@${uid}.service`], {
        captureStdout: true,
        captureStderr: true,
      })
    );
    yield* Effect.promise(() => Bun.sleep(500));
  });

/**
 * Clean up all podman resources for a user.
 */
const cleanupPodmanResources = (
  username: string,
  uid: number
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    // Remove all containers
    yield* Effect.ignore(
      execAsUser(
        username as unknown as Parameters<typeof execAsUser>[0],
        uid,
        ["podman", "rm", "--all", "--force"],
        {
          captureStdout: true,
          captureStderr: true,
        }
      )
    );

    // Remove all volumes
    yield* Effect.ignore(
      execAsUser(
        username as unknown as Parameters<typeof execAsUser>[0],
        uid,
        ["podman", "volume", "rm", "--all", "--force"],
        {
          captureStdout: true,
          captureStderr: true,
        }
      )
    );

    // List and remove networks (except podman default)
    const networksResult = yield* Effect.either(
      execAsUser(
        username as unknown as Parameters<typeof execAsUser>[0],
        uid,
        ["podman", "network", "ls", "--format", "{{.Name}}"],
        { captureStdout: true, captureStderr: true }
      )
    );

    if (networksResult._tag === "Right" && networksResult.right.stdout) {
      const networks = networksResult.right.stdout
        .split("\n")
        .map((n) => n.trim())
        .filter((n) => n && n !== "podman");

      for (const network of networks) {
        yield* Effect.ignore(
          execAsUser(
            username as unknown as Parameters<typeof execAsUser>[0],
            uid,
            ["podman", "network", "rm", network],
            {
              captureStdout: true,
              captureStderr: true,
            }
          )
        );
      }
    }
  });

/**
 * Remove all container storage for a user.
 */
const cleanupContainerStorage = (
  homeDir: AbsolutePath,
  logger: Logger
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    const storageDir = `${homeDir}/.local/share/containers/storage` as AbsolutePath;

    if (!(yield* directoryExists(storageDir))) {
      return;
    }

    const result = yield* Effect.either(removeDirectory(storageDir, true));
    if (result._tag === "Left") {
      logger.warn(`Failed to remove container storage: ${result.left.message}`);
    }
  });

/**
 * Kill all processes belonging to a user.
 */
const killUserProcesses = (uid: number): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    // pkill -U sends SIGTERM to all processes owned by the user
    yield* Effect.ignore(
      exec(["pkill", "-U", String(uid)], {
        captureStdout: true,
        captureStderr: true,
      })
    );

    yield* Effect.promise(() => Bun.sleep(500));

    // Force kill any remaining processes with SIGKILL
    yield* Effect.ignore(
      exec(["pkill", "-9", "-U", String(uid)], {
        captureStdout: true,
        captureStderr: true,
      })
    );

    yield* Effect.promise(() => Bun.sleep(200));
  });
