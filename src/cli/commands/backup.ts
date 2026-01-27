// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Service data backup orchestration. Delegates to service-specific
 * backup implementations since each service has different data
 * structures (SQLite, uploads directory, etc.). Validates capability
 * support before attempting - not all services implement backup.
 */

import { Effect, Match, Option, pipe } from "effect";
import { type DivbanEffectError, ErrorCode, GeneralError } from "../../lib/errors";
import { logSuccess } from "../../lib/log";
import type { BackupResult, ExistentialService } from "../../services/types";
import {
  createServiceLayer,
  formatBytes,
  loadConfigOrFallback,
  resolvePrerequisites,
} from "./utils";

export interface BackupOptions {
  readonly service: ExistentialService;
  readonly dryRun: boolean;
  readonly format: "pretty" | "json";
  readonly verbose: boolean;
  readonly force: boolean;
}

export const executeBackup = (options: BackupOptions): Effect.Effect<void, DivbanEffectError> =>
  Effect.gen(function* () {
    const { service, dryRun, format, verbose, force } = options;

    return yield* Effect.if(service.definition.capabilities.hasBackup, {
      onTrue: (): Effect.Effect<void, DivbanEffectError> =>
        Effect.if(dryRun, {
          onTrue: (): Effect.Effect<void> => Effect.logInfo("Dry run - would create backup"),
          onFalse: (): Effect.Effect<void, DivbanEffectError> =>
            Effect.gen(function* () {
              yield* Effect.logInfo(`Creating backup for ${service.definition.name}...`);

              const prereqs = yield* resolvePrerequisites(service.definition.name, null);

              const result = yield* service.apply((s) =>
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

                  return yield* Option.match(Option.fromNullable(s.backup), {
                    onNone: (): Effect.Effect<never, GeneralError> =>
                      Effect.fail(
                        new GeneralError({
                          code: ErrorCode.GENERAL_ERROR,
                          message: `Service '${service.definition.name}' backup method not implemented`,
                        })
                      ),
                    onSome: (backupFn): Effect.Effect<BackupResult, DivbanEffectError> =>
                      backupFn().pipe(Effect.provide(layer)),
                  });
                })
              );

              yield* pipe(
                Match.value(format),
                Match.when("json", () =>
                  Effect.logInfo(
                    JSON.stringify({
                      path: result.path,
                      size: result.size,
                      timestamp: result.timestamp,
                    })
                  )
                ),
                Match.when("pretty", () =>
                  Effect.gen(function* () {
                    yield* logSuccess(`Backup created: ${result.path}`);
                    yield* Effect.logInfo(`Size: ${formatBytes(result.size)}`);
                  })
                ),
                Match.exhaustive
              );
            }),
        }),
      onFalse: (): Effect.Effect<never, GeneralError> =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.GENERAL_ERROR,
            message: `Service '${service.definition.name}' does not support backup`,
          })
        ),
    });
  });
