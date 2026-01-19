// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Secret management CLI commands.
 */

import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, Ok, type Result } from "../../lib/result";
import type { ServiceName } from "../../lib/types";
import type { AnyService } from "../../services/types";
import { getServiceSecret, listServiceSecrets } from "../../system/secrets";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";

export interface SecretOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute secret command (router for subcommands).
 */
export const executeSecret = (options: SecretOptions): Promise<Result<void, DivbanError>> => {
  const { args } = options;

  switch (args.subcommand) {
    case "show":
      return executeSecretShow(options);
    case "list":
      return executeSecretList(options);
    default:
      return Promise.resolve(
        Err(
          new DivbanError(ErrorCode.INVALID_ARGS, `Unknown secret subcommand: ${args.subcommand}`)
        )
      );
  }
};

/**
 * Show a specific secret value.
 */
const executeSecretShow = async (options: SecretOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;
  const serviceName = service.definition.name as ServiceName;
  const secretName = args.secretName;

  if (!secretName) {
    return Err(new DivbanError(ErrorCode.INVALID_ARGS, "Secret name is required"));
  }

  // Get service user
  const usernameResult = getServiceUsername(serviceName);
  if (!usernameResult.ok) {
    return usernameResult;
  }

  const userResult = await getUserByName(usernameResult.value);
  if (!userResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.SECRET_NOT_FOUND,
        `Service '${serviceName}' is not configured. Run setup first.`
      )
    );
  }

  const { homeDir } = userResult.value;

  // Get secret
  const secretResult = await getServiceSecret(serviceName, secretName, homeDir);
  if (!secretResult.ok) {
    return secretResult;
  }

  // Output just the value (for scripting)
  logger.raw(secretResult.value);
  return Ok(undefined);
};

/**
 * List all available secrets for a service.
 */
const executeSecretList = async (options: SecretOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;
  const serviceName = service.definition.name as ServiceName;

  // Get service user
  const usernameResult = getServiceUsername(serviceName);
  if (!usernameResult.ok) {
    return usernameResult;
  }

  const userResult = await getUserByName(usernameResult.value);
  if (!userResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.SECRET_NOT_FOUND,
        `Service '${serviceName}' is not configured. Run setup first.`
      )
    );
  }

  const { homeDir } = userResult.value;

  // List secrets
  const secretsResult = await listServiceSecrets(serviceName, homeDir);
  if (!secretsResult.ok) {
    return secretsResult;
  }

  if (args.format === "json") {
    logger.raw(JSON.stringify({ service: serviceName, secrets: secretsResult.value }));
  } else {
    logger.info(`Secrets for ${serviceName}:`);
    for (const name of secretsResult.value) {
      logger.raw(`  - ${name}`);
    }
  }

  return Ok(undefined);
};
