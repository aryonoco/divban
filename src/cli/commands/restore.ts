// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based restore command - restore from a backup.
 */

import { Effect } from "effect";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { toAbsolutePathEffect } from "../../lib/paths";
import type { AnyServiceEffect } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { createServiceLayer, getContextOptions, resolvePrerequisitesOptionalConfig } from "./utils";

export interface RestoreOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the restore command.
 */
export const executeRestore = (options: RestoreOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    // Check if service supports restore
    if (!(service.definition.capabilities.hasRestore && service.restore)) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `Service '${service.definition.name}' does not support restore`,
        })
      );
    }

    // Check backup path is provided
    if (!args.backupPath) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "Backup path is required for restore command",
        })
      );
    }

    if (args.dryRun) {
      logger.info(`Dry run - would restore from: ${args.backupPath}`);
      return;
    }

    // Warn about data overwrite
    if (!args.force) {
      logger.warn("This will overwrite existing data!");
      logger.warn("Use --force to skip this warning.");
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: "Restore requires --force flag for safety",
        })
      );
    }

    const validBackupPath = yield* toAbsolutePathEffect(args.backupPath);
    logger.info(`Restoring ${service.definition.name} from: ${validBackupPath}`);

    const prereqs = yield* resolvePrerequisitesOptionalConfig(service, args.configPath);

    const layer = createServiceLayer(
      prereqs.config,
      service.configTag,
      prereqs,
      getContextOptions(args),
      logger
    );

    // biome-ignore lint/style/noNonNullAssertion: capability check above ensures restore exists
    yield* service.restore!(validBackupPath).pipe(Effect.provide(layer));

    if (args.format === "json") {
      logger.info(JSON.stringify({ success: true, service: service.definition.name }));
    } else {
      logger.success("Restore completed successfully");
      logger.info(`You may need to restart the service: divban ${service.definition.name} restart`);
    }
  });
