// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Service startup with dependency ordering. Multi-container stacks
 * start in topological order (databases before apps). Triggers
 * systemd daemon-reload first to pick up any quadlet changes,
 * then starts via systemctl --user.
 */

import { Effect } from "effect";
import type { DivbanEffectError } from "../../lib/errors";
import type { ExistentialService } from "../../services/types";
import { createServiceLayer, loadConfigOrFallback, resolvePrerequisites } from "./utils";

export interface StartOptions {
  readonly service: ExistentialService;
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly force: boolean;
}

export const executeStart = (options: StartOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, dryRun, verbose, force } = options;

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
          { dryRun, verbose, force }
        );
        yield* s.start().pipe(Effect.provide(layer));
      })
    );
  });
