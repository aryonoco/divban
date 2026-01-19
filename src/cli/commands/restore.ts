// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Restore command - restore from a backup.
 */

import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result, asyncFlatMapResult } from "../../lib/result";
import type { AbsolutePath } from "../../lib/types";
import type { AnyService } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { buildServiceContext } from "./utils";

export interface RestoreOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the restore command.
 * Uses buildServiceContext with requireConfig: true.
 */
export const executeRestore = async (
  options: RestoreOptions
): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

  // Check if service supports restore
  if (!(service.definition.capabilities.hasRestore && service.restore)) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Service '${service.definition.name}' does not support restore`
      )
    );
  }

  // Check backup path is provided
  if (!args.backupPath) {
    return Err(
      new DivbanError(ErrorCode.INVALID_ARGS, "Backup path is required for restore command")
    );
  }

  if (args.dryRun) {
    logger.info(`Dry run - would restore from: ${args.backupPath}`);
    return Ok(undefined);
  }

  // Warn about data overwrite
  if (!args.force) {
    logger.warn("This will overwrite existing data!");
    logger.warn("Use --force to skip this warning.");
    return Err(
      new DivbanError(ErrorCode.GENERAL_ERROR, "Restore requires --force flag for safety")
    );
  }

  logger.info(`Restoring ${service.definition.name} from: ${args.backupPath}`);

  // Chain: buildContext → restore → log success
  return asyncFlatMapResult(
    await buildServiceContext({ ...options, requireConfig: true }),
    async ({ ctx }) => {
      // biome-ignore lint/style/noNonNullAssertion: capability check above ensures restore exists
      const restoreResult = await service.restore!(ctx, args.backupPath as AbsolutePath);

      if (!restoreResult.ok) {
        return restoreResult;
      }

      if (args.format === "json") {
        logger.info(JSON.stringify({ success: true, service: service.definition.name }));
      } else {
        logger.success("Restore completed successfully");
        logger.info(
          `You may need to restart the service: divban ${service.definition.name} restart`
        );
      }

      return Ok(undefined);
    }
  );
};
