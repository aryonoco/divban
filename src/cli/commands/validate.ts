/**
 * Validate command - validate a service configuration file.
 */

import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result } from "../../lib/result";
import type { AbsolutePath } from "../../lib/types";
import type { Service } from "../../services/types";
import type { ParsedArgs } from "../parser";

export interface ValidateOptions {
  service: Service;
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
