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

import { Effect } from "effect";
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

    yield* service.apply((s) =>
      s
        .validate(validPath)
        .pipe(
          Effect.tapError((error) =>
            Effect.sync(() => logger.fail(`Validation failed: ${error.message}`))
          )
        )
    );
    logger.success("Configuration is valid");
  });
