// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based setup command - full service setup (generate, install, enable).
 */

import { Effect, Exit } from "effect";
import { loadServiceConfig } from "../../config/loader";
import { getUserAllocationSettings } from "../../config/merge";
import type { GlobalConfig } from "../../config/schema";
import { getServiceUsername } from "../../config/schema";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import {
  configFilePath,
  toAbsolutePathEffect,
  userConfigDir,
  userDataDir,
  userQuadletDir,
} from "../../lib/paths";
import { userIdToGroupId } from "../../lib/types";
import { cleanupConfigBackup, copyConfigTracked, rollbackConfigCopy } from "../../services/helpers";
import type { AnyServiceEffect, ServiceContext } from "../../services/types";
import {
  ensureServiceDirectoriesTracked,
  removeDirectoriesReverse,
} from "../../system/directories";
import { disableLinger, enableLingerTracked } from "../../system/linger";
import { ensureUnprivilegedPorts, isUnprivilegedPortEnabled } from "../../system/sysctl";
import { acquireServiceUser, getUserByName, releaseServiceUser } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { detectSystemCapabilities, getContextOptions, getDataDirFromConfig } from "./utils";

export interface SetupOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
  globalConfig: GlobalConfig;
}

/**
 * Execute the setup command.
 */
export const executeSetup = (options: SetupOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger, globalConfig } = options;
    const configPath = args.configPath;

    // Get UID allocation settings from global config
    const uidSettings = getUserAllocationSettings(globalConfig);

    if (!configPath) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "Config path is required for setup command",
        })
      );
    }

    logger.info(`Setting up ${service.definition.name}...`);

    // Chain: validate path → load config
    const validConfigPath = yield* toAbsolutePathEffect(configPath);
    const config = yield* loadServiceConfig(validConfigPath, service.definition.configSchema);

    // Get service username
    const username = yield* getServiceUsername(service.definition.name);

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
      return;
    }

    // For caddy, check if privileged port binding needs to be configured
    const needsSysctl =
      service.definition.name === "caddy" && !(yield* isUnprivilegedPortEnabled());
    const totalSteps = needsSysctl ? 8 : 7;
    let currentStep = 0;

    // Check if running as root (required for user creation and sysctl)
    if (process.getuid?.() !== 0) {
      // Check if user already exists
      const existingUser = yield* Effect.either(getUserByName(username));
      if (existingUser._tag === "Left") {
        return yield* Effect.fail(
          new GeneralError({
            code: ErrorCode.ROOT_REQUIRED as 3,
            message: "Root privileges required to create service user. Run with sudo.",
          })
        );
      }
      // For caddy, also check if sysctl needs root
      if (needsSysctl) {
        return yield* Effect.fail(
          new GeneralError({
            code: ErrorCode.ROOT_REQUIRED as 3,
            message:
              "Root privileges required to configure privileged port binding. Run with sudo.",
          })
        );
      }
    }

    // Main scoped setup - compositional resource management
    yield* Effect.scoped(
      Effect.gen(function* () {
        // Step 1 (caddy only): Sysctl - idempotent, no rollback needed
        if (needsSysctl) {
          currentStep++;
          logger.step(currentStep, totalSteps, "Configuring privileged port binding...");
          yield* ensureUnprivilegedPorts(70, service.definition.name);
        }

        // Step 2: User - scoped resource with conditional rollback
        currentStep++;
        logger.step(currentStep, totalSteps, `Creating service user: ${username}...`);
        const userAcq = yield* Effect.acquireRelease(
          acquireServiceUser(service.definition.name, uidSettings),
          (acq, exit) =>
            Exit.isFailure(exit) && acq.wasCreated
              ? releaseServiceUser(service.definition.name, true)
              : Effect.void
        );
        const { uid, homeDir } = userAcq.value;
        const gid = userIdToGroupId(uid);

        // Step 3: Linger - scoped resource with conditional rollback
        currentStep++;
        logger.step(currentStep, totalSteps, "Enabling user linger...");
        yield* Effect.acquireRelease(enableLingerTracked(username, uid), (acq, exit) =>
          Exit.isFailure(exit) && acq.wasCreated
            ? disableLinger(username).pipe(Effect.ignore)
            : Effect.void
        );

        // Step 4: Directories - scoped resource with tracked rollback
        currentStep++;
        logger.step(currentStep, totalSteps, "Creating service directories...");
        const dataDir = getDataDirFromConfig(config, userDataDir(homeDir));
        yield* Effect.acquireRelease(
          ensureServiceDirectoriesTracked(dataDir, homeDir, { uid, gid }),
          (result, exit) =>
            Exit.isFailure(exit) ? removeDirectoriesReverse(result.createdPaths) : Effect.void
        );

        // Step 5: Config copy - scoped resource with backup/restore
        currentStep++;
        logger.step(currentStep, totalSteps, "Copying configuration file...");
        const configDestPath = configFilePath(
          userConfigDir(homeDir),
          `${service.definition.name}.toml`
        );
        yield* Effect.acquireRelease(
          copyConfigTracked(validConfigPath, configDestPath, { uid, gid }),
          (result, exit) =>
            Exit.isFailure(exit)
              ? rollbackConfigCopy(configDestPath, result)
              : cleanupConfigBackup(result)
        );

        // Build service context
        const system = yield* detectSystemCapabilities();

        const ctx: ServiceContext<unknown> = {
          config,
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
          system,
        };

        // Step 6: Service-specific setup
        currentStep++;
        logger.step(currentStep, totalSteps, "Running service-specific setup...");
        yield* service.setup(ctx);
      })
    );

    logger.success(`${service.definition.name} setup completed successfully`);
    logger.info("Next steps:");
    logger.info(`  Start service: divban ${service.definition.name} start`);
    logger.info(`  Check status:  divban ${service.definition.name} status`);
    logger.info(`  View logs:     divban ${service.definition.name} logs --follow`);
  });
