// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Configuration validation without side effects. Parses TOML and
 * runs Effect Schema validation, reporting all errors found. Useful
 * for CI pipelines and pre-commit hooks to catch config issues
 * before deployment.
 */

import { Effect, Either } from "effect";
import type { DivbanEffectError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { toAbsolutePathEffect } from "../../lib/paths";
import type { ExistentialService } from "../../services/types";

export interface ValidateOptions {
  readonly service: ExistentialService;
  readonly configPath: string;
  readonly logger: Logger;
}

export const executeValidate = (options: ValidateOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, configPath, logger } = options;
    const validPath = yield* toAbsolutePathEffect(configPath);
    logger.info(`Validating configuration: ${validPath}`);

    // validate() is context-free, use apply() to access the method
    const result = yield* service.apply((s) => Effect.either(s.validate(validPath)));

    type ResultType = Effect.Effect<void, DivbanEffectError>;
    return yield* Either.match(result, {
      onLeft: (err): ResultType => {
        logger.fail(`Validation failed: ${err.message}`);
        return Effect.fail(err);
      },
      onRight: (): ResultType => {
        logger.success("Configuration is valid");
        return Effect.void;
      },
    });
  });
