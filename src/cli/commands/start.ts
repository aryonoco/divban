// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Start command - start a service.
 */

import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { buildServicePaths, userDataDir } from "../../lib/paths";
import { Err, type Result } from "../../lib/result";
import { userIdToGroupId } from "../../lib/types";
import type { AnyService, ServiceContext } from "../../services/types";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { getContextOptions, resolveServiceConfig } from "./utils";

export interface StartOptions {
  service: AnyService;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the start command.
 */
export const executeStart = async (options: StartOptions): Promise<Result<void, DivbanError>> => {
  const { service, args, logger } = options;

  // Get service user
  const usernameResult = getServiceUsername(service.definition.name);
  if (!usernameResult.ok) {
    return usernameResult;
  }
  const username = usernameResult.value;

  const userResult = await getUserByName(username);
  if (!userResult.ok) {
    return Err(
      new DivbanError(
        ErrorCode.SERVICE_NOT_FOUND,
        `Service user '${username}' not found. Run 'divban ${service.definition.name} setup' first.`
      )
    );
  }

  const { uid, homeDir } = userResult.value;
  const gid = userIdToGroupId(uid);

  // Resolve config
  const configResult = await resolveServiceConfig(service, homeDir);

  // Build service context
  const dataDir = userDataDir(homeDir);
  const paths = buildServicePaths(homeDir, dataDir);

  const ctx: ServiceContext<unknown> = {
    config: configResult.ok ? configResult.value : {},
    logger,
    paths,
    user: {
      name: username,
      uid,
      gid,
    },
    options: getContextOptions(args),
  };

  return service.start(ctx);
};
