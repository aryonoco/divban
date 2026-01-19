// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Validate command - validate a service configuration file.
 */

import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result, asyncFlatMapResult } from "../../lib/result";
import type { AnyService } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { toAbsolute } from "./utils";

export interface ValidateOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the validate command.
 */
export const executeValidate = (options: ValidateOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;
  const configPath = args.configPath;

  if (!configPath) {
    return Promise.resolve(
      Err(new DivbanError(ErrorCode.INVALID_ARGS, "Config path is required for validate command"))
    );
  }

  // Chain: validate path → validate config → log result
  return asyncFlatMapResult(toAbsolute(configPath), async (validPath) => {
    logger.info(`Validating configuration: ${validPath}`);

    const result = await service.validate(validPath);

    if (!result.ok) {
      logger.fail(`Validation failed: ${result.error.message}`);
      return result;
    }

    logger.success("Configuration is valid");
    return Ok(undefined);
  });
};
