// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container image updates via podman auto-update. Checks registries
 * for newer images matching the configured tags, pulls updates, and
 * restarts containers with new images. Only affects containers with
 * AutoUpdate label set in their quadlet definitions.
 */

import { Effect, Match, pipe } from "effect";
import { getServiceUsername } from "../../config/schema";
import { ErrorCode, GeneralError, ServiceError, type SystemError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { ServiceName, UserId, Username } from "../../lib/types";
import type { ExistentialService } from "../../services/types";
import { exec } from "../../system/exec";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";

export interface UpdateOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

interface UpdateContext {
  readonly username: Username;
  readonly uid: UserId;
  readonly logger: Logger;
  readonly serviceName: ServiceName;
}

type UpdateStatus =
  | { readonly kind: "NoUpdates" }
  | { readonly kind: "UpdatesAvailable" }
  | { readonly kind: "UpToDate" };

const NO_UPDATES: UpdateStatus = { kind: "NoUpdates" };
const UPDATES_AVAILABLE: UpdateStatus = { kind: "UpdatesAvailable" };
const UP_TO_DATE: UpdateStatus = { kind: "UpToDate" };

const resolveUpdateServiceUser = (
  serviceName: ServiceName
): Effect.Effect<
  { readonly username: Username; readonly uid: UserId },
  GeneralError | ServiceError | SystemError
> =>
  Effect.gen(function* () {
    const username = yield* getServiceUsername(serviceName);
    const user = yield* getUserByName(username).pipe(
      Effect.mapError(
        () =>
          new ServiceError({
            code: ErrorCode.SERVICE_NOT_FOUND as 30,
            message: `Service user '${username}' not found. Run 'divban ${serviceName}' setup first.`,
            service: serviceName,
          })
      )
    );
    return { username, uid: user.uid };
  });

const buildAutoUpdateArgs = (
  username: Username,
  uid: UserId,
  dryRun: boolean
): readonly string[] => {
  const baseArgs = [
    "sudo",
    "-u",
    username as unknown as string,
    `XDG_RUNTIME_DIR=/run/user/${uid}`,
    "podman",
    "auto-update",
  ] as const;
  return dryRun ? [...baseArgs, "--dry-run"] : [...baseArgs];
};

const checkForUpdates = (
  context: UpdateContext
): Effect.Effect<string, GeneralError | SystemError> =>
  exec(buildAutoUpdateArgs(context.username, context.uid, true), {
    captureStdout: true,
    captureStderr: true,
  }).pipe(
    Effect.map((result) => result.stdout),
    Effect.mapError(
      (err) =>
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: "Failed to check for updates",
          cause: err,
        })
    )
  );

const applyUpdates = (context: UpdateContext): Effect.Effect<void, GeneralError | SystemError> =>
  exec(buildAutoUpdateArgs(context.username, context.uid, false), {
    captureStdout: true,
    captureStderr: true,
  }).pipe(
    Effect.flatMap((result) =>
      pipe(
        Match.value(result.exitCode !== 0),
        Match.when(true, () =>
          Effect.fail(
            new GeneralError({
              code: ErrorCode.GENERAL_ERROR as 1,
              message: `Failed to apply updates: ${result.stderr}`,
            })
          )
        ),
        Match.when(false, () => Effect.void),
        Match.exhaustive
      )
    ),
    Effect.mapError((err) =>
      err instanceof GeneralError
        ? err
        : new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: "Failed to apply updates",
            cause: err,
          })
    )
  );

const parseUpdateStatus = (output: string): UpdateStatus =>
  pipe(
    Match.value(output),
    Match.when(
      (o) => o.includes("false"),
      () => NO_UPDATES
    ),
    Match.when(
      (o) => o.includes("true") || o.includes("pending"),
      () => UPDATES_AVAILABLE
    ),
    Match.orElse(() => UP_TO_DATE)
  );

const handleUpdateResult = (
  status: UpdateStatus,
  context: UpdateContext
): Effect.Effect<void, GeneralError | SystemError> =>
  pipe(
    Match.value(status),
    Match.when({ kind: "NoUpdates" }, () =>
      Effect.sync(() => context.logger.info("No updates available"))
    ),
    Match.when({ kind: "UpToDate" }, () =>
      Effect.sync(() => context.logger.info("All images are up to date"))
    ),
    Match.when({ kind: "UpdatesAvailable" }, () =>
      Effect.gen(function* () {
        context.logger.info("Updates available. Applying...");
        yield* applyUpdates(context);
        context.logger.success("Updates applied successfully");
      })
    ),
    Match.exhaustive
  );

const handleDryRun = (logger: Logger): Effect.Effect<void> =>
  Effect.sync(() => logger.info("Dry run - would check for updates and restart if needed"));

const performUpdate = (context: UpdateContext): Effect.Effect<void, GeneralError | SystemError> =>
  Effect.gen(function* () {
    const output = yield* checkForUpdates(context);
    const status = parseUpdateStatus(output);
    yield* handleUpdateResult(status, context);
  });

export const executeUpdate = (
  options: UpdateOptions
): Effect.Effect<void, GeneralError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    const { username, uid } = yield* resolveUpdateServiceUser(service.definition.name);
    logger.info(`Updating ${service.definition.name} containers...`);

    yield* pipe(
      Match.value(args.dryRun),
      Match.when(true, () => handleDryRun(logger)),
      Match.when(false, () =>
        performUpdate({ username, uid, logger, serviceName: service.definition.name })
      ),
      Match.exhaustive
    );
  });
