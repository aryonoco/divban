// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based validate command - validate a service configuration file.
 */

import { Effect } from "effect";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { toAbsolutePathEffect } from "../../lib/paths";
import type { AnyServiceEffect } from "../../services/types";
import type { ParsedArgs } from "../parser";

export interface ValidateOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the validate command.
 */
export const executeValidate = (options: ValidateOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const configPath = args.configPath;

    if (!configPath) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "Config path is required for validate command",
        })
      );
    }

    const validPath = yield* toAbsolutePathEffect(configPath);
    logger.info(`Validating configuration: ${validPath}`);

    const result = yield* Effect.either(service.validate(validPath));

    if (result._tag === "Left") {
      logger.fail(`Validation failed: ${result.left.message}`);
      return yield* Effect.fail(result.left);
    }

    logger.success("Configuration is valid");
  });
