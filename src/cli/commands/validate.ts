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
import { Err, Ok, type Result } from "../../lib/result";
import type { AbsolutePath } from "../../lib/types";
import type { AnyService } from "../../services/types";
import type { ParsedArgs } from "../parser";

export interface ValidateOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the validate command.
 */
export const executeValidate = async (
  options: ValidateOptions
): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;
  const configPath = args.configPath;

  if (!configPath) {
    return Err(
      new DivbanError(ErrorCode.INVALID_ARGS, "Config path is required for validate command")
    );
  }

  logger.info(`Validating configuration: ${configPath}`);

  const result = await service.validate(configPath as AbsolutePath);

  if (!result.ok) {
    logger.fail(`Validation failed: ${result.error.message}`);
    return result;
  }

  logger.success("Configuration is valid");
  return Ok(undefined);
};
