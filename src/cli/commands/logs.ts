// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Journalctl integration for service logs. Streams logs from systemd
 * journal filtered by service user, supporting follow mode and line
 * limits. Works without config - uses service username convention
 * to locate the correct journal entries.
 */

import { Effect, Match, pipe } from "effect";
import type { DivbanEffectError } from "../../lib/errors";
import type { ExistentialService } from "../../services/types";
import { createServiceLayer, loadConfigOrFallback, resolvePrerequisites } from "./utils";

export interface LogsOptions {
  readonly service: ExistentialService;
  readonly follow: boolean;
  readonly lines: number;
  readonly container: string | undefined;
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly force: boolean;
}

export const executeLogs = (options: LogsOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, follow, lines, container, dryRun, verbose, force } = options;

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

        yield* s
          .logs({
            follow,
            lines,
            ...pipe(
              Match.value(container),
              Match.when(undefined, () => ({})),
              Match.orElse((c) => ({ container: c }))
            ),
          })
          .pipe(Effect.provide(layer));
      })
    );
  });
