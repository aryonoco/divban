// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Multi-step service removal. Cleanup must follow a specific order:
 * containers → volumes → networks → linger → systemd → storage → processes → user.
 * Skipping steps or reordering causes resource leaks or removal failures.
 */

import { Effect, Either, Match, pipe } from "effect";
import { getServiceDataDir, getServiceUsername } from "../../config/schema";
import { ErrorCode, GeneralError, type ServiceError, type SystemError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { AbsolutePath, ServiceName, UserId, Username } from "../../lib/types";
import type { ExistentialService } from "../../services/types";
import { removeDirectory } from "../../system/directories";
import { exec, execAsUser } from "../../system/exec";
import { directoryExists } from "../../system/fs";
import { disableLinger } from "../../system/linger";
import { userExists } from "../../system/uid-allocator";
import { deleteServiceUser, getUserByName, requireRoot } from "../../system/user";
import type { ParsedArgs } from "../parser";

export interface RemoveOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

export const executeRemove = (
  options: RemoveOptions
): Effect.Effect<void, GeneralError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const serviceName = service.definition.name;

    yield* requireRoot();

    const username = yield* getServiceUsername(serviceName);

    // Check if user exists - return early if not
    const exists = yield* userExists(username);
    type RemoveResultEffect = Effect.Effect<void, GeneralError | ServiceError | SystemError>;
    return yield* Effect.if(!exists, {
      onTrue: (): RemoveResultEffect =>
        Effect.sync(() => {
          logger.warn(`Service user '${username}' does not exist. Nothing to remove.`);
        }),
      onFalse: (): RemoveResultEffect =>
        Effect.gen(function* () {
          const dataDir = yield* getServiceDataDir(serviceName);
          const { uid, homeDir } = yield* getUserByName(username);

          return yield* Effect.if(args.dryRun, {
            onTrue: (): RemoveResultEffect =>
              Effect.sync(() => {
                logger.info("Dry-run mode - showing what would be done:");
                logger.info(`  1. Stop all containers for ${username}`);
                logger.info("  2. Remove all podman containers, volumes, networks");
                logger.info(`  3. Disable linger for ${username}`);
                logger.info(`  4. Stop systemd user service (user@${uid}.service)`);
                logger.info(`  5. Remove container storage for ${username}`);
                logger.info(`  6. Kill all processes owned by ${username}`);
                logger.info(`  7. Delete user ${username} (and home directory)`);
                pipe(
                  Match.value(args.preserveData),
                  Match.when(true, () => logger.info(`  8. Preserve data directory ${dataDir}`)),
                  Match.when(false, () => logger.info(`  8. Remove data directory ${dataDir}`)),
                  Match.exhaustive
                );
              }),
            onFalse: (): RemoveResultEffect =>
              Effect.gen(function* () {
                yield* pipe(
                  Effect.succeed(args.force),
                  Effect.filterOrFail(
                    (f): f is true => f === true,
                    () => {
                      logger.warn(
                        `This will permanently remove ${serviceName} and delete user ${username}.`
                      );
                      return new GeneralError({
                        code: ErrorCode.GENERAL_ERROR as 1,
                        message: "Use --force to confirm removal",
                      });
                    }
                  )
                );

                yield* doRemoveService(serviceName, username, uid, homeDir, dataDir, args, logger);
              }),
          });
        }),
    });
  });

const doRemoveService = (
  serviceName: ServiceName,
  username: Username,
  uid: UserId,
  homeDir: AbsolutePath,
  dataDir: AbsolutePath,
  args: ParsedArgs,
  logger: Logger
): Effect.Effect<void, GeneralError | ServiceError | SystemError> =>
  Effect.gen(function* () {
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
    Either.match(lingerResult, {
      onLeft: (err): void => {
        logger.warn(`Failed to disable linger: ${err.message}`);
      },
      onRight: (): void => undefined,
    });

    // Step 4: Stop systemd user service
    logger.step(4, totalSteps, "Stopping systemd user service...");
    yield* stopUserService(uid);

    // Step 5: Remove container storage (volumes, images, etc.)
    logger.step(5, totalSteps, "Removing container storage...");
    yield* cleanupContainerStorage(homeDir, logger);

    // Step 6: Kill any remaining user processes
    logger.step(6, totalSteps, "Killing user processes...");
    yield* killUserProcesses(uid);

    // Step 7: Delete user (also removes home directory with quadlet files)
    logger.step(7, totalSteps, "Deleting service user...");
    yield* deleteServiceUser(serviceName);

    // Step 8: Remove data directory (unless --preserve-data)
    yield* Effect.when(
      Effect.gen(function* () {
        logger.step(8, totalSteps, "Removing data directory...");
        const rmResult = yield* Effect.either(removeDirectory(dataDir, true));
        Either.match(rmResult, {
          onLeft: (err): void => {
            logger.warn(`Failed to remove data directory: ${err.message}`);
          },
          onRight: (): void => undefined,
        });
      }),
      () => !args.preserveData
    );

    logger.success(`Service ${serviceName} removed successfully`);
  });

const stopUserService = (uid: UserId): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* Effect.ignore(
      exec(["systemctl", "stop", `user@${uid}.service`], {
        captureStdout: true,
        captureStderr: true,
      })
    );
    yield* Effect.promise(() => Bun.sleep(500));
  });

const cleanupPodmanResources = (
  username: Username,
  uid: UserId
): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    yield* Effect.ignore(
      execAsUser(username, uid, ["podman", "rm", "--all", "--force"], {
        captureStdout: true,
        captureStderr: true,
      })
    );

    yield* Effect.ignore(
      execAsUser(username, uid, ["podman", "volume", "rm", "--all", "--force"], {
        captureStdout: true,
        captureStderr: true,
      })
    );

    // List and remove networks (except podman default)
    const networksResult = yield* Effect.either(
      execAsUser(username, uid, ["podman", "network", "ls", "--format", "{{.Name}}"], {
        captureStdout: true,
        captureStderr: true,
      })
    );

    yield* Either.match(networksResult, {
      onLeft: (): Effect.Effect<void, SystemError | GeneralError> => Effect.void,
      onRight: (result): Effect.Effect<void, SystemError | GeneralError> =>
        Effect.if(Boolean(result.stdout), {
          onTrue: (): Effect.Effect<void, SystemError | GeneralError> =>
            Effect.gen(function* () {
              const networks = result.stdout
                .split("\n")
                .map((n) => n.trim())
                .filter((n) => n && n !== "podman");

              yield* Effect.forEach(
                networks,
                (network) =>
                  Effect.ignore(
                    execAsUser(username, uid, ["podman", "network", "rm", network], {
                      captureStdout: true,
                      captureStderr: true,
                    })
                  ),
                { discard: true }
              );
            }),
          onFalse: (): Effect.Effect<void, SystemError | GeneralError> => Effect.void,
        }),
    });
  });

const cleanupContainerStorage = (
  homeDir: AbsolutePath,
  logger: Logger
): Effect.Effect<void, SystemError | GeneralError> =>
  pipe(
    directoryExists(`${homeDir}/.local/share/containers/storage` as AbsolutePath),
    Effect.flatMap((exists) =>
      Effect.if(exists, {
        onTrue: (): Effect.Effect<void, SystemError | GeneralError> =>
          Effect.gen(function* () {
            const storageDir = `${homeDir}/.local/share/containers/storage` as AbsolutePath;
            const result = yield* Effect.either(removeDirectory(storageDir, true));
            Either.match(result, {
              onLeft: (err): void => {
                logger.warn(`Failed to remove container storage: ${err.message}`);
              },
              onRight: (): void => undefined,
            });
          }),
        onFalse: (): Effect.Effect<void> => Effect.void,
      })
    )
  );

const killUserProcesses = (uid: UserId): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    // SIGTERM first, then SIGKILL - graceful termination window before force kill
    yield* Effect.ignore(
      exec(["pkill", "-U", String(uid)], {
        captureStdout: true,
        captureStderr: true,
      })
    );

    yield* Effect.promise(() => Bun.sleep(500));

    yield* Effect.ignore(
      exec(["pkill", "-9", "-U", String(uid)], {
        captureStdout: true,
        captureStderr: true,
      })
    );

    yield* Effect.promise(() => Bun.sleep(200));
  });
