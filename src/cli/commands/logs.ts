/**
 * Logs command - view service logs.
 */

import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { Err, type Result } from "../../lib/result";
import type { AbsolutePath, GroupId } from "../../lib/types";
import type { LogOptions, Service, ServiceContext } from "../../services/types";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";
import { getContextOptions, resolveServiceConfig } from "./utils";

export interface LogsCommandOptions {
  service: Service;
  args: ParsedArgs;
  logger: Logger;
}

/**
 * Execute the logs command.
 */
export const executeLogs = async (
  options: LogsCommandOptions
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

  // Resolve config (may fail if not found, which is OK for logs)
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
    options: getContextOptions(args),
  };

  // Build log options
  const logOptions: LogOptions = {
    follow: args.follow,
    lines: args.lines,
    ...(args.container && { container: args.container }),
  };

  return service.logs(ctx, logOptions);
};
