// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Reload command - reload service configuration (if supported).
 */

import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result, asyncFlatMapResult } from "../../lib/result";
import type { AnyService } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { buildServiceContext } from "./utils";

export interface ReloadOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the reload command.
 * Uses buildServiceContext with requireConfig: true.
 */
export const executeReload = async (options: ReloadOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

  // Check if service supports reload
  if (!(service.definition.capabilities.hasReload && service.reload)) {
    return Err(
      new DivbanError(
        ErrorCode.GENERAL_ERROR,
        `Service '${service.definition.name}' does not support reload. Use 'restart' instead.`
      )
    );
  }

  if (args.dryRun) {
    logger.info("Dry run - would reload configuration");
    return Ok(undefined);
  }

  logger.info(`Reloading ${service.definition.name} configuration...`);

  // Chain: buildContext → reload → log success
  return asyncFlatMapResult(
    await buildServiceContext({ ...options, requireConfig: true }),
    async ({ ctx }) => {
      // biome-ignore lint/style/noNonNullAssertion: capability check above ensures reload exists
      const reloadResult = await service.reload!(ctx);

      if (!reloadResult.ok) {
        return reloadResult;
      }

      logger.success("Configuration reloaded successfully");
      return Ok(undefined);
    }
  );
};
