// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Secret inspection via Podman secrets API. Lists and shows secrets
 * stored in the service user's Podman secret store. Read-only -
 * secret creation happens during setup from age-encrypted files
 * in the config directory.
 */

import { Effect, Either, Match, pipe } from "effect";
import { getServiceUsername } from "../../config/schema";
import {
  ContainerError,
  ErrorCode,
  GeneralError,
  type ServiceError,
  type SystemError,
} from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { ExistentialService } from "../../services/types";
import { getServiceSecret, listServiceSecrets } from "../../system/secrets";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";

export interface SecretOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

export const executeSecret = (
  options: SecretOptions
): Effect.Effect<void, GeneralError | ContainerError | ServiceError | SystemError> =>
  pipe(
    Match.value(options.args.subcommand),
    Match.when("show", () => executeSecretShow(options)),
    Match.when("list", () => executeSecretList(options)),
    Match.orElse((cmd) =>
      Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Unknown secret subcommand: ${cmd}`,
        })
      )
    )
  );

const executeSecretShow = (
  options: SecretOptions
): Effect.Effect<void, GeneralError | ContainerError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const svcName = service.definition.name;
    const secretName = args.secretName;

    return yield* pipe(
      Match.value(secretName),
      Match.when(undefined, () =>
        Effect.fail(
          new GeneralError({
            code: ErrorCode.INVALID_ARGS as 2,
            message: "Secret name is required",
          })
        )
      ),
      Match.orElse((name) =>
        Effect.gen(function* () {
          const username = yield* getServiceUsername(svcName);
          const userResult = yield* Effect.either(getUserByName(username));

          type ResultType = Effect.Effect<
            void,
            GeneralError | ContainerError | ServiceError | SystemError
          >;
          return yield* Either.match(userResult, {
            onLeft: (): ResultType =>
              Effect.fail(
                new ContainerError({
                  code: ErrorCode.SECRET_NOT_FOUND as 46,
                  message: `Service '${svcName}' is not configured. Run setup first.`,
                  container: svcName,
                })
              ),
            onRight: ({ homeDir }): ResultType =>
              Effect.gen(function* () {
                const secretValue = yield* getServiceSecret(svcName, name, homeDir);
                // Output just the value (for scripting)
                logger.raw(secretValue);
              }),
          });
        })
      )
    );
  });

const executeSecretList = (
  options: SecretOptions
): Effect.Effect<void, GeneralError | ContainerError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const svcName = service.definition.name;

    const username = yield* getServiceUsername(svcName);
    const userResult = yield* Effect.either(getUserByName(username));

    type ResultType = Effect.Effect<
      void,
      GeneralError | ContainerError | ServiceError | SystemError
    >;
    return yield* Either.match(userResult, {
      onLeft: (): ResultType =>
        Effect.fail(
          new ContainerError({
            code: ErrorCode.SECRET_NOT_FOUND as 46,
            message: `Service '${svcName}' is not configured. Run setup first.`,
            container: svcName,
          })
        ),
      onRight: ({ homeDir }): ResultType =>
        Effect.gen(function* () {
          const secrets = yield* listServiceSecrets(svcName, homeDir);

          yield* pipe(
            Match.value(args.format),
            Match.when("json", () =>
              Effect.sync(() => logger.raw(JSON.stringify({ service: svcName, secrets })))
            ),
            Match.when("pretty", () =>
              Effect.gen(function* () {
                logger.info(`Secrets for ${svcName}:`);
                yield* Effect.forEach(
                  secrets,
                  (name) => Effect.sync(() => logger.raw(`  - ${name}`)),
                  { discard: true }
                );
              })
            ),
            Match.exhaustive
          );
        }),
    });
  });
