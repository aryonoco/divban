// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Graceful service shutdown. For multi-container stacks, stops in
 * reverse dependency order - apps before databases. Uses systemctl
 * stop which sends SIGTERM, allowing containers to clean up before
 * the configured timeout.
 */

import { Effect } from "effect";
import type { DivbanEffectError } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { ExistentialService } from "../../services/types";
import { createServiceLayer, loadConfigOrFallback, resolvePrerequisites } from "./utils";

export interface StopOptions {
  readonly service: ExistentialService;
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly force: boolean;
  readonly logger: Logger;
}

export const executeStop = (options: StopOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, dryRun, verbose, force, logger } = options;

    const prereqs = yield* resolvePrerequisites(service.definition.name, null);

    yield* service.apply((s) =>
      Effect.gen(function* () {
        const { config, paths: updatedPaths } = yield* loadConfigOrFallback(
          service.definition.name,
          prereqs.user.homeDir,
          s.configSchema,
          prereqs
        );

        const layer = createServiceLayer(
          config,
          s.configTag,
          { ...prereqs, paths: updatedPaths },
          { dryRun, verbose, force },
          logger
        );
        yield* s.stop().pipe(Effect.provide(layer));
      })
    );
  });
