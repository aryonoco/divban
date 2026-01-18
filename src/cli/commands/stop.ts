/**
 * Stop command - stop a service.
 */

import type { Logger } from "../../lib/logger";
import type { Service, ServiceContext } from "../../services/types";
import type { ParsedArgs } from "../parser";
import { DivbanError, ErrorCode } from "../../lib/errors";
import { Err, type Result } from "../../lib/result";
import type { AbsolutePath, GroupId } from "../../lib/types";
import { getServiceUsername } from "../../config/schema";
import { getUserByName } from "../../system/user";
import { resolveServiceConfig } from "./utils";

export interface StopOptions {
  service: Service;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the stop command.
 */
export const executeStop = async (
  options: StopOptions
): Promise<Result<void, DivbanError>> => {
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
        `Service user '${username}' not found. Service may not be set up.`
      )
    );
  }

  const { uid, homeDir } = userResult.value;
  const gid = uid as unknown as GroupId;

  // Resolve config (may fail if not found, which is OK for stop)
  const configResult = await resolveServiceConfig(service, homeDir);

  // Build service context
  const ctx: ServiceContext = {
    config: configResult.ok ? configResult.value : {},
    logger,
    paths: {
      dataDir: `${homeDir}/data` as AbsolutePath,
      quadletDir: `${homeDir}/.config/containers/systemd` as AbsolutePath,
      configDir: `${homeDir}/.config/divban` as AbsolutePath,
    },
    user: {
      name: username,
      uid,
      gid,
    },
  };

  return service.stop(ctx);
};
