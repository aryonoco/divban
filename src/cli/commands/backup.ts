// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Backup command - create a service backup.
 */

import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result, asyncFlatMapResult } from "../../lib/result";
import type { AnyService } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { buildServiceContext, formatBytes } from "./utils";

export interface BackupOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the backup command.
 * Uses buildServiceContext with requireConfig: true.
 */
export const executeBackup = async (options: BackupOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

  // Check if service supports backup (must be done before context resolution)
  if (!(service.definition.capabilities.hasBackup && service.backup)) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Service '${service.definition.name}' does not support backup`
      )
    );
  }

  if (args.dryRun) {
    logger.info("Dry run - would create backup");
    return Ok(undefined);
  }

  logger.info(`Creating backup for ${service.definition.name}...`);

  // Chain: buildContext → backup → log success
  return asyncFlatMapResult(
    await buildServiceContext({ ...options, requireConfig: true }),
    async ({ ctx }) => {
      // biome-ignore lint/style/noNonNullAssertion: capability check above ensures backup exists
      const backupResult = await service.backup!(ctx);

      if (!backupResult.ok) {
        return backupResult;
      }

      const result = backupResult.value;

      if (args.format === "json") {
        logger.info(
          JSON.stringify({ path: result.path, size: result.size, timestamp: result.timestamp })
        );
      } else {
        logger.success(`Backup created: ${result.path}`);
        logger.info(`Size: ${formatBytes(result.size)}`);
      }

      return Ok(undefined);
    }
  );
};
