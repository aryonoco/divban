// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based reload command - reload service configuration (if supported).
 */

import { Effect } from "effect";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { AnyServiceEffect } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { createServiceLayer, getContextOptions, resolvePrerequisitesOptionalConfig } from "./utils";

export interface ReloadOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the reload command.
 */
export const executeReload = (options: ReloadOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    // Check if service supports reload
    if (!(service.definition.capabilities.hasReload && service.reload)) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.GENERAL_ERROR as 1,
          message: `Service '${service.definition.name}' does not support reload. Use 'restart' instead.`,
        })
      );
    }

    if (args.dryRun) {
      logger.info("Dry run - would reload configuration");
      return;
    }

    logger.info(`Reloading ${service.definition.name} configuration...`);

    const prereqs = yield* resolvePrerequisitesOptionalConfig(service, args.configPath);

    const layer = createServiceLayer(
      prereqs.config,
      service.configTag,
      prereqs,
      getContextOptions(args),
      logger
    );

    // biome-ignore lint/style/noNonNullAssertion: capability check above ensures reload exists
    yield* service.reload!().pipe(Effect.provide(layer));

    logger.success("Configuration reloaded successfully");
  });
