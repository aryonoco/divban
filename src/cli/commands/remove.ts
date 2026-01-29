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
import { createStepCounter, logSuccess } from "../../lib/log";
import {
  type AbsolutePath,
  type ServiceName,
  type UserId,
  type Username,
  pathJoin,
} from "../../lib/types";
import type { ExistentialService } from "../../services/types";
import { removeDirectory } from "../../system/directories";
import { exec, execAsUser } from "../../system/exec";
import { directoryExists } from "../../system/fs";
import { disableLinger } from "../../system/linger";
import { userExists } from "../../system/uid-allocator";
import { deleteServiceUser, getUserByName, requireRoot } from "../../system/user";

/** Options controlling removal behavior. dryRun previews without changes; force skips confirmation. */
export interface RemoveOptions {
  readonly service: ExistentialService;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly preserveData: boolean;
}

/** Orchestrates multi-step service removal. Order matters: containers before user session, linger before systemd stop. */
export const executeRemove = (
  options: RemoveOptions
): Effect.Effect<void, GeneralError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { service, dryRun, force, preserveData } = options;
    const serviceName = service.definition.name;

    yield* requireRoot();

    const username = yield* getServiceUsername(serviceName);

    const exists = yield* userExists(username);
    type RemoveResultEffect = Effect.Effect<void, GeneralError | ServiceError | SystemError>;
    return yield* Effect.if(!exists, {
      onTrue: (): RemoveResultEffect =>
        Effect.logWarning(`Service user '${username}' does not exist. Nothing to remove.`),
      onFalse: (): RemoveResultEffect =>
        Effect.gen(function* () {
          const dataDir = yield* getServiceDataDir(serviceName);
          const { uid, homeDir } = yield* getUserByName(username);

          return yield* Effect.if(dryRun, {
            onTrue: (): RemoveResultEffect =>
              Effect.gen(function* () {
                yield* Effect.logInfo("Dry-run mode - showing what would be done:");
                yield* Effect.logInfo(`  1. Stop all containers for ${username}`);
                yield* Effect.logInfo("  2. Remove all podman containers, volumes, networks");
                yield* Effect.logInfo(`  3. Disable linger for ${username}`);
                yield* Effect.logInfo(`  4. Stop systemd user service (user@${uid}.service)`);
                yield* Effect.logInfo(`  5. Remove container storage for ${username}`);
                yield* Effect.logInfo(`  6. Kill all processes owned by ${username}`);
                yield* Effect.logInfo(`  7. Delete user ${username} (and home directory)`);
                yield* pipe(
                  Match.value(preserveData),
                  Match.when(true, () => Effect.logInfo(`  8. Preserve data directory ${dataDir}`)),
                  Match.when(false, () => Effect.logInfo(`  8. Remove data directory ${dataDir}`)),
                  Match.exhaustive
                );
              }),
            onFalse: (): RemoveResultEffect =>
              Effect.gen(function* () {
                yield* pipe(
                  Effect.succeed(force),
                  Effect.filterOrFail(
                    (f): f is true => f === true,
                    () =>
                      new GeneralError({
                        code: ErrorCode.GENERAL_ERROR,
                        message: "Use --force to confirm removal",
                      })
                  ),
                  Effect.tapError(() =>
                    Effect.logWarning(
                      `This will permanently remove ${serviceName} and delete user ${username}.`
                    )
                  )
                );

                yield* doRemoveService(serviceName, username, uid, homeDir, dataDir, preserveData);
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
  preserveData: boolean
): Effect.Effect<void, GeneralError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const totalSteps = preserveData ? 7 : 8;
    const counter = yield* createStepCounter(totalSteps);

    // Stop containers before removing resources they hold open
    yield* counter.next("Stopping containers...");
    yield* Effect.ignore(
      execAsUser(username, uid, ["podman", "stop", "--all", "-t", "10"], {
        captureStdout: true,
        captureStderr: true,
      })
    );

    // Remove podman resources while user session is still active
    yield* counter.next("Removing containers, volumes, and networks...");
    yield* cleanupPodmanResources(username, uid);

    // Disable linger before stopping user service to prevent auto-restart
    yield* counter.next("Disabling linger...");
    yield* disableLinger(username).pipe(
      Effect.tapError((err) => Effect.logWarning(`Failed to disable linger: ${err.message}`)),
      Effect.ignore
    );

    // Stop systemd user slice; containers and linger must be gone first
    yield* counter.next("Stopping systemd user service...");
    yield* stopUserService(uid);

    // Remove storage after systemd is down to avoid "device busy" errors
    yield* counter.next("Removing container storage...");
    yield* cleanupContainerStorage(homeDir);

    // Kill orphaned processes before deleting the user that owns them
    yield* counter.next("Killing user processes...");
    yield* killUserProcesses(uid);

    // Delete user last; userdel fails if processes or mounts remain
    yield* counter.next("Deleting service user...");
    yield* deleteServiceUser(serviceName);

    // Data dir removal is optional; all dependencies are already gone

    yield* Effect.when(
      Effect.gen(function* () {
        yield* counter.next("Removing data directory...");
        yield* removeDirectory(dataDir, true).pipe(
          Effect.tapError((err) =>
            Effect.logWarning(`Failed to remove data directory: ${err.message}`)
          ),
          Effect.ignore
        );
      }),
      () => !preserveData
    );

    yield* logSuccess(`Service ${serviceName} removed successfully`);
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

/** Removes containers, volumes, and networks while user session is still active. */
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

    // Podman default network is built-in and cannot be deleted
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

/** Removes container storage after systemd is down to avoid "device busy" errors. */
const cleanupContainerStorage = (
  homeDir: AbsolutePath
): Effect.Effect<void, SystemError | GeneralError> =>
  pipe(
    directoryExists(pathJoin(homeDir, ".local/share/containers/storage")),
    Effect.flatMap((exists) =>
      Effect.if(exists, {
        onTrue: (): Effect.Effect<void, SystemError | GeneralError> =>
          Effect.gen(function* () {
            const storageDir = pathJoin(homeDir, ".local/share/containers/storage");
            yield* removeDirectory(storageDir, true).pipe(
              Effect.tapError((err) =>
                Effect.logWarning(`Failed to remove container storage: ${err.message}`)
              ),
              Effect.ignore
            );
          }),
        onFalse: (): Effect.Effect<void> => Effect.void,
      })
    )
  );

/** Terminates orphaned processes before user deletion. SIGTERM then SIGKILL with grace period. */
const killUserProcesses = (uid: UserId): Effect.Effect<void, SystemError | GeneralError> =>
  Effect.gen(function* () {
    // 500ms grace period allows processes to clean up before forced termination
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
