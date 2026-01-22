// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based backup command - create a service backup.
 */

import { Effect } from "effect";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { AnyServiceEffect } from "../../services/types";
import type { ParsedArgs } from "../parser";
import {
  createServiceLayer,
  formatBytes,
  getContextOptions,
  resolvePrerequisitesOptionalConfig,
} from "./utils";

export interface BackupOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the backup command.
 */
export const executeBackup = (options: BackupOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    // Check if service supports backup (must be done before context resolution)
    if (!(service.definition.capabilities.hasBackup && service.backup)) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `Service '${service.definition.name}' does not support backup`,
        })
      );
    }

    if (args.dryRun) {
      logger.info("Dry run - would create backup");
      return;
    }

    logger.info(`Creating backup for ${service.definition.name}...`);

    const prereqs = yield* resolvePrerequisitesOptionalConfig(service, args.configPath);

    const layer = createServiceLayer(
      prereqs.config,
      service.configTag,
      prereqs,
      getContextOptions(args),
      logger
    );

    // biome-ignore lint/style/noNonNullAssertion: capability check above ensures backup exists
    const result = yield* service.backup!().pipe(Effect.provide(layer));

    if (args.format === "json") {
      logger.info(
        JSON.stringify({ path: result.path, size: result.size, timestamp: result.timestamp })
      );
    } else {
      logger.success(`Backup created: ${result.path}`);
      logger.info(`Size: ${formatBytes(result.size)}`);
    }
  });
