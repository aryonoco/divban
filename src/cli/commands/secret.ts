// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based secret management CLI commands.
 */

import { Effect } from "effect";
import { getServiceUsername } from "../../config/schema";
import {
  ContainerError,
  ErrorCode,
  GeneralError,
  type ServiceError,
  type SystemError,
} from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import type { ServiceName } from "../../lib/types";
import type { ExistentialService } from "../../services/types";
import { getServiceSecret, listServiceSecrets } from "../../system/secrets";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";

export interface SecretOptions {
  service: ExistentialService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute secret command (router for subcommands).
 */
export const executeSecret = (
  options: SecretOptions
): Effect.Effect<void, GeneralError | ContainerError | ServiceError | SystemError> => {
  const { args } = options;

  switch (args.subcommand) {
    case "show":
      return executeSecretShow(options);
    case "list":
      return executeSecretList(options);
    default:
      return Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Unknown secret subcommand: ${args.subcommand}`,
        })
      );
  }
};

/**
 * Show a specific secret value.
 */
const executeSecretShow = (
  options: SecretOptions
): Effect.Effect<void, GeneralError | ContainerError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const serviceName = service.definition.name as ServiceName;
    const secretName = args.secretName;

    if (!secretName) {
      return yield* Effect.fail(
        new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: "Secret name is required",
        })
      );
    }

    // Get service user
    const username = yield* getServiceUsername(serviceName);

    const userResult = yield* Effect.either(getUserByName(username));
    if (userResult._tag === "Left") {
      return yield* Effect.fail(
        new ContainerError({
          code: ErrorCode.SECRET_NOT_FOUND as 46,
          message: `Service '${serviceName}' is not configured. Run setup first.`,
          container: serviceName,
        })
      );
    }

    const { homeDir } = userResult.right;

    // Get secret
    const secretValue = yield* getServiceSecret(serviceName, secretName, homeDir);

    // Output just the value (for scripting)
    logger.raw(secretValue);
  });

/**
 * List all available secrets for a service.
 */
const executeSecretList = (
  options: SecretOptions
): Effect.Effect<void, GeneralError | ContainerError | ServiceError | SystemError> =>
  Effect.gen(function* () {
    const { service, args, logger } = options;
    const serviceName = service.definition.name as ServiceName;

    // Get service user
    const username = yield* getServiceUsername(serviceName);

    const userResult = yield* Effect.either(getUserByName(username));
    if (userResult._tag === "Left") {
      return yield* Effect.fail(
        new ContainerError({
          code: ErrorCode.SECRET_NOT_FOUND as 46,
          message: `Service '${serviceName}' is not configured. Run setup first.`,
          container: serviceName,
        })
      );
    }

    const { homeDir } = userResult.right;

    // List secrets
    const secrets = yield* listServiceSecrets(serviceName, homeDir);

    if (args.format === "json") {
      logger.raw(JSON.stringify({ service: serviceName, secrets }));
    } else {
      logger.info(`Secrets for ${serviceName}:`);
      yield* Effect.forEach(secrets, (name) => Effect.sync(() => logger.raw(`  - ${name}`)), {
        discard: true,
      });
    }
  });
