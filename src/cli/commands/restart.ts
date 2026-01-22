// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based restart command - restart a service.
 * Uses Layer.provide pattern for dependency injection.
 */

import { Effect } from "effect";
import type { DivbanEffectError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { AnyServiceEffect } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { createServiceLayer, getContextOptions, resolvePrerequisitesOptionalConfig } from "./utils";

export interface RestartOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the restart command.
 */
export const executeRestart = (options: RestartOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;

    const prereqs = yield* resolvePrerequisitesOptionalConfig(service, args.configPath);

    const layer = createServiceLayer(
      prereqs.config,
      service.configTag,
      prereqs,
      getContextOptions(args),
      logger
    );

    yield* service.restart().pipe(Effect.provide(layer));
  });
