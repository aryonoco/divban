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

import { Effect, Exit, Match, Ref, pipe } from "effect";
import { loadServiceConfig } from "../../config/loader";
import type { GlobalConfig } from "../../config/schema";
import { getServiceUsername } from "../../config/schema";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import { logStep, logSuccess } from "../../lib/log";
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
import { createServiceLayer, detectSystemCapabilities, getDataDirFromConfig } from "./utils";

export interface SetupOptions {
  readonly service: ExistentialService;
  readonly configPath: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly verbose: boolean;
  readonly globalConfig: GlobalConfig;
}

export const executeSetup = (options: SetupOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, configPath, dryRun, force, verbose, globalConfig } = options;

    const uidSettings = globalConfig.users;

    yield* Effect.logInfo(`Setting up ${service.definition.name}...`);

    const validConfigPath = yield* toAbsolutePathEffect(configPath);

    const username = yield* getServiceUsername(service.definition.name);

    // Caddy binds ports 80/443 which require sysctl net.ipv4.ip_unprivileged_port_start
    const needsSysctl =
      service.definition.name === "caddy" && !(yield* isUnprivilegedPortEnabled());

    if (dryRun) {
      yield* Effect.logInfo("Dry run mode - showing what would be done:");
      if (service.definition.name === "caddy") {
        yield* Effect.logInfo("  1. Configure privileged port binding (sysctl)");
        yield* Effect.logInfo(`  2. Create user: ${username}`);
        yield* Effect.logInfo(`  3. Enable linger for: ${username}`);
        yield* Effect.logInfo("  4. Create data directories");
        yield* Effect.logInfo("  5. Copy configuration file");
        yield* Effect.logInfo("  6. Generate and install quadlet files");
        yield* Effect.logInfo("  7. Reload systemd daemon");
        yield* Effect.logInfo("  8. Enable services");
      } else {
        yield* Effect.logInfo(`  1. Create user: ${username}`);
        yield* Effect.logInfo(`  2. Enable linger for: ${username}`);
        yield* Effect.logInfo("  3. Create data directories");
        yield* Effect.logInfo("  4. Copy configuration file");
        yield* Effect.logInfo("  5. Generate and install quadlet files");
        yield* Effect.logInfo("  6. Reload systemd daemon");
        yield* Effect.logInfo("  7. Enable services");
      }
      return;
    }

    const totalSteps = pipe(
      Match.value(needsSysctl),
      Match.when(true, () => 8),
      Match.when(false, () => 7),
      Match.exhaustive
    );

    const isRoot = process.getuid?.() === 0;
    yield* Effect.if(isRoot, {
      onTrue: (): Effect.Effect<void> => Effect.void,
      onFalse: (): Effect.Effect<void, GeneralError> =>
        Effect.gen(function* () {
          yield* getUserByName(username).pipe(
            Effect.mapError(
              () =>
                new GeneralError({
                  code: ErrorCode.ROOT_REQUIRED,
                  message: "Root privileges required to create service user. Run with sudo.",
                })
            )
          );
          yield* Effect.if(needsSysctl, {
            onTrue: (): Effect.Effect<void, GeneralError> =>
              Effect.fail(
                new GeneralError({
                  code: ErrorCode.ROOT_REQUIRED,
                  message:
                    "Root privileges required to configure privileged port binding. Run with sudo.",
                })
              ),
            onFalse: (): Effect.Effect<void> => Effect.void,
          });
        }),
    });

    yield* service.apply((s) =>
      Effect.gen(function* () {
        const config = yield* loadServiceConfig(validConfigPath, s.configSchema);

        const stepRef = yield* Ref.make(0);
        const nextStep = (message: string): Effect.Effect<void> =>
          Effect.gen(function* () {
            const step = yield* Ref.updateAndGet(stepRef, (n) => n + 1);
            yield* logStep(step, totalSteps, message);
          });

        // Scoped region: acquireRelease finalizers run in reverse order on any exit
        yield* Effect.scoped(
          Effect.gen(function* () {
            // Sysctl is idempotent; no rollback needed on failure
            yield* Effect.if(needsSysctl, {
              onTrue: (): Effect.Effect<void, DivbanEffectError> =>
                Effect.gen(function* () {
                  yield* nextStep("Configuring privileged port binding...");
                  yield* ensureUnprivilegedPorts(70, service.definition.name);
                }),
              onFalse: (): Effect.Effect<void> => Effect.void,
            });

            // Only roll back user creation if we created it (idempotent re-run safety)
            yield* nextStep(`Creating service user: ${username}...`);
            const userAcq = yield* Effect.acquireRelease(
              acquireServiceUser(service.definition.name, uidSettings),
              (acq, exit): Effect.Effect<void> =>
                Exit.match(exit, {
                  onSuccess: (): Effect.Effect<void> => Effect.void,
                  onFailure: (): Effect.Effect<void> =>
                    Effect.if(acq.wasCreated, {
                      onTrue: (): Effect.Effect<void> =>
                        releaseServiceUser(service.definition.name, true),
                      onFalse: (): Effect.Effect<void> => Effect.void,
                    }),
                })
            );
            const { uid, homeDir } = userAcq.value;
            const gid = userIdToGroupId(uid);

            yield* nextStep("Enabling user linger...");
            yield* Effect.acquireRelease(
              enableLingerTracked(username, uid),
              (acq, exit): Effect.Effect<void> =>
                Exit.match(exit, {
                  onSuccess: (): Effect.Effect<void> => Effect.void,
                  onFailure: (): Effect.Effect<void> =>
                    Effect.if(acq.wasCreated, {
                      onTrue: (): Effect.Effect<void> =>
                        disableLinger(username).pipe(Effect.ignore),
                      onFalse: (): Effect.Effect<void> => Effect.void,
                    }),
                })
            );

            // Tracked directories enable precise rollback: only remove dirs we created
            yield* nextStep("Creating service directories...");
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

            // Config copy creates .bak before overwriting; rollback restores from .bak
            yield* nextStep("Copying configuration file...");
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
              { dryRun, verbose, force }
            );

            // Service-specific setup runs last because it depends on user, directories, and config
            yield* nextStep("Running service-specific setup...");
            yield* s.setup().pipe(Effect.provide(layer));
          })
        );
      })
    );

    yield* logSuccess(`${service.definition.name} setup completed successfully`);
    yield* Effect.logInfo("Next steps:");
    yield* Effect.logInfo(`  Start service: divban start ${service.definition.name}`);
    yield* Effect.logInfo(`  Check status:  divban status ${service.definition.name}`);
    yield* Effect.logInfo(`  View logs:     divban logs ${service.definition.name} --follow`);
  });
