// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Idempotent service provisioning. Creates user, enables linger,
 * creates directories, generates quadlets, copies config, and
 * enables services - all with automatic rollback on failure.
 * Safe to re-run: skips existing resources, updates changed files.
 */

import { Effect, Either, Exit, Match, pipe } from "effect";
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
import type { ExistentialService } from "../../services/types";
import {
  ensureServiceDirectoriesTracked,
  removeDirectoriesReverse,
} from "../../system/directories";
import { disableLinger, enableLingerTracked } from "../../system/linger";
import { ensureUnprivilegedPorts, isUnprivilegedPortEnabled } from "../../system/sysctl";
import { acquireServiceUser, getUserByName, releaseServiceUser } from "../../system/user";
import type { ParsedArgs } from "../parser";
import {
  createServiceLayer,
  detectSystemCapabilities,
  getContextOptions,
  getDataDirFromConfig,
} from "./utils";

export interface SetupOptions {
  service: ExistentialService;
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

    // Validate path first
    const validConfigPath = yield* toAbsolutePathEffect(configPath);

    // Get service username
    const username = yield* getServiceUsername(service.definition.name);

    // For caddy, check if privileged port binding needs to be configured
    const needsSysctl =
      service.definition.name === "caddy" && !(yield* isUnprivilegedPortEnabled());

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

    const totalSteps = pipe(
      Match.value(needsSysctl),
      Match.when(true, () => 8),
      Match.when(false, () => 7),
      Match.exhaustive
    );

    // Check if running as root (required for user creation and sysctl)
    const isRoot = process.getuid?.() === 0;
    yield* pipe(
      Match.value(isRoot),
      Match.when(true, () => Effect.void),
      Match.when(false, () =>
        Effect.gen(function* () {
          // Check if user already exists
          type CheckResultType = Effect.Effect<void, GeneralError>;
          const existingUser = yield* Effect.either(getUserByName(username));
          yield* Either.match(existingUser, {
            onLeft: (): CheckResultType =>
              Effect.fail(
                new GeneralError({
                  code: ErrorCode.ROOT_REQUIRED as 3,
                  message: "Root privileges required to create service user. Run with sudo.",
                })
              ),
            onRight: (): CheckResultType =>
              pipe(
                Match.value(needsSysctl),
                Match.when(true, () =>
                  Effect.fail(
                    new GeneralError({
                      code: ErrorCode.ROOT_REQUIRED as 3,
                      message:
                        "Root privileges required to configure privileged port binding. Run with sudo.",
                    })
                  )
                ),
                Match.when(false, () => Effect.void),
                Match.exhaustive
              ),
          });
        })
      ),
      Match.orElse(() => Effect.void)
    );

    // Access service methods with proper config typing
    yield* service.apply((s) =>
      Effect.gen(function* () {
        // Load and validate config with typed schema
        const config = yield* loadServiceConfig(validConfigPath, s.configSchema);

        let currentStep = 0;

        // Main scoped setup with automatic rollback on failure
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
              (acq, exit): Effect.Effect<void> =>
                Exit.match(exit, {
                  onSuccess: (): Effect.Effect<void> => Effect.void,
                  onFailure: (): Effect.Effect<void> =>
                    pipe(
                      Match.value(acq.wasCreated),
                      Match.when(true, () => releaseServiceUser(service.definition.name, true)),
                      Match.when(false, () => Effect.void),
                      Match.exhaustive
                    ),
                })
            );
            const { uid, homeDir } = userAcq.value;
            const gid = userIdToGroupId(uid);

            // Step 3: Linger - scoped resource with conditional rollback
            currentStep++;
            logger.step(currentStep, totalSteps, "Enabling user linger...");
            yield* Effect.acquireRelease(
              enableLingerTracked(username, uid),
              (acq, exit): Effect.Effect<void> =>
                Exit.match(exit, {
                  onSuccess: (): Effect.Effect<void> => Effect.void,
                  onFailure: (): Effect.Effect<void> =>
                    pipe(
                      Match.value(acq.wasCreated),
                      Match.when(true, () => disableLinger(username).pipe(Effect.ignore)),
                      Match.when(false, () => Effect.void),
                      Match.exhaustive
                    ),
                })
            );

            // Step 4: Directories - scoped resource with tracked rollback
            currentStep++;
            logger.step(currentStep, totalSteps, "Creating service directories...");
            const dataDir = getDataDirFromConfig(config, userDataDir(homeDir));
            yield* Effect.acquireRelease(
              ensureServiceDirectoriesTracked(dataDir, homeDir, { uid, gid }),
              (result, exit): Effect.Effect<void> =>
                Exit.match(exit, {
                  onSuccess: (): Effect.Effect<void> => Effect.void,
                  onFailure: (): Effect.Effect<void> =>
                    removeDirectoriesReverse(result.createdPaths),
                })
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
              (result, exit): Effect.Effect<void> =>
                Exit.match(exit, {
                  onSuccess: (): Effect.Effect<void> => cleanupConfigBackup(result),
                  onFailure: (): Effect.Effect<void> => rollbackConfigCopy(configDestPath, result),
                })
            );

            // Build service layer
            const system = yield* detectSystemCapabilities();

            const layer = createServiceLayer(
              config,
              s.configTag,
              {
                user: { name: username, uid, gid, homeDir },
                system,
                paths: {
                  dataDir,
                  quadletDir: userQuadletDir(homeDir),
                  configDir: userConfigDir(homeDir),
                  homeDir,
                },
              },
              getContextOptions(args),
              logger
            );

            // Step 6: Service-specific setup
            currentStep++;
            logger.step(currentStep, totalSteps, "Running service-specific setup...");
            yield* s.setup().pipe(Effect.provide(layer));
          })
        );
      })
    );

    logger.success(`${service.definition.name} setup completed successfully`);
    logger.info("Next steps:");
    logger.info(`  Start service: divban ${service.definition.name} start`);
    logger.info(`  Check status:  divban ${service.definition.name} status`);
    logger.info(`  View logs:     divban ${service.definition.name} logs --follow`);
  });
