// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based update command - update container images.
 */

import { Effect } from "effect";
import { getServiceUsername } from "../../config/schema";
import {
  type ConfigError,
  ErrorCode,
  GeneralError,
  ServiceError,
  type SystemError,
} from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { AnyServiceEffect } from "../../services/types";
import { exec } from "../../system/exec";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { resolveServiceConfig } from "./utils";

export interface UpdateOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the update command.
 */
export const executeUpdate = (
  options: UpdateOptions
): Effect.Effect<void, GeneralError | ServiceError | ConfigError | SystemError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    // Get service user
    const username = yield* getServiceUsername(service.definition.name);

    const userResult = yield* Effect.either(getUserByName(username));
    if (userResult._tag === "Left") {
      return yield* Effect.fail(
        new ServiceError({
          code: ErrorCode.SERVICE_NOT_FOUND as 30,
          message: `Service user '${username}' not found. Run 'divban ${service.definition.name} setup' first.`,
          service: service.definition.name,
        })
      );
    }

    const { uid, homeDir } = userResult.right;

    // Resolve config
    yield* resolveServiceConfig(service, homeDir);

    logger.info(`Updating ${service.definition.name} containers...`);

    if (args.dryRun) {
      logger.info("Dry run - would check for updates and restart if needed");
      return;
    }

    // Use systemctl to trigger auto-update
    const updateResult = yield* Effect.either(
      exec(
        [
          "sudo",
          "-u",
          username as unknown as string,
          `XDG_RUNTIME_DIR=/run/user/${uid}`,
          "podman",
          "auto-update",
          "--dry-run",
        ],
        { captureStdout: true, captureStderr: true }
      )
    );

    if (updateResult._tag === "Left") {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: "Failed to check for updates",
          cause: updateResult.left,
        })
      );
    }

    const output = updateResult.right.stdout;

    if (output.includes("false")) {
      logger.info("No updates available");
      return;
    }

    if (output.includes("true") || output.includes("pending")) {
      logger.info("Updates available. Applying...");

      // Apply updates
      const applyResult = yield* Effect.either(
        exec(
          [
            "sudo",
            "-u",
            username as unknown as string,
            `XDG_RUNTIME_DIR=/run/user/${uid}`,
            "podman",
            "auto-update",
          ],
          { captureStdout: true, captureStderr: true }
        )
      );

      if (applyResult._tag === "Left" || applyResult.right.exitCode !== 0) {
        const stderr = applyResult._tag === "Right" ? applyResult.right.stderr : "";
        return yield* Effect.fail(
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR as 1,
            message: `Failed to apply updates: ${stderr}`,
          })
        );
      }

      logger.success("Updates applied successfully");
    } else {
      logger.info("All images are up to date");
    }
  });
