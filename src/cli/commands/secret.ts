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

import { Effect, Match, pipe } from "effect";
import { getServiceUsername } from "../../config/schema";
import {
  ContainerError,
  ErrorCode,
  type GeneralError,
  type ServiceError,
  type SystemError,
} from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { ExistentialService } from "../../services/types";
import { getServiceSecret, listServiceSecrets } from "../../system/secrets";
import { getUserByName } from "../../system/user";

export interface SecretShowOptions {
  readonly service: ExistentialService;
  readonly secretName: string;
  readonly logger: Logger;
}

export interface SecretListOptions {
  readonly service: ExistentialService;
  readonly format: "pretty" | "json";
  readonly logger: Logger;
}

export const executeSecretShow = (
  options: SecretShowOptions
): Effect.Effect<void, GeneralError | ContainerError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { service, secretName, logger } = options;
    const svcName = service.definition.name;

    const username = yield* getServiceUsername(svcName);
    const { homeDir } = yield* getUserByName(username).pipe(
      Effect.mapError(
        () =>
          new ContainerError({
            code: ErrorCode.SECRET_NOT_FOUND as 46,
            message: `Service '${svcName}' is not configured. Run setup first.`,
            container: svcName,
          })
      )
    );
    const secretValue = yield* getServiceSecret(svcName, secretName, homeDir);
    logger.raw(secretValue);
  });

export const executeSecretList = (
  options: SecretListOptions
): Effect.Effect<void, GeneralError | ContainerError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { service, format, logger } = options;
    const svcName = service.definition.name;

    const username = yield* getServiceUsername(svcName);
    const { homeDir } = yield* getUserByName(username).pipe(
      Effect.mapError(
        () =>
          new ContainerError({
            code: ErrorCode.SECRET_NOT_FOUND as 46,
            message: `Service '${svcName}' is not configured. Run setup first.`,
            container: svcName,
          })
      )
    );
    const secrets = yield* listServiceSecrets(svcName, homeDir);

    yield* pipe(
      Match.value(format),
      Match.when("json", () =>
        Effect.sync(() => logger.raw(JSON.stringify({ service: svcName, secrets })))
      ),
      Match.when("pretty", () =>
        Effect.gen(function* () {
          logger.info(`Secrets for ${svcName}:`);
          yield* Effect.forEach(secrets, (name) => Effect.sync(() => logger.raw(`  - ${name}`)), {
            discard: true,
          });
        })
      ),
      Match.exhaustive
    );
  });
