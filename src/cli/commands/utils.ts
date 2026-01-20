// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect-based shared utilities for CLI commands.
 */

import { Effect } from "effect";
import { loadServiceConfig } from "../../config/loader";
import { getServiceUsername } from "../../config/schema";
import {
  ConfigError,
  ErrorCode,
  type GeneralError,
  ServiceError,
  type SystemError,
} from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import {
  buildServicePaths,
  toAbsolutePathEffect,
  userConfigDir,
  userDataDir,
  userQuadletDir,
} from "../../lib/paths";
import {
  AbsolutePath,
  type AbsolutePath as AbsolutePathType,
  type GroupId,
  type UserId,
  type Username,
  pathJoin,
  userIdToGroupId,
} from "../../lib/types";
import type { AnyServiceEffect, ServiceContext, SystemCapabilities } from "../../services/types";
import { isSELinuxEnforcing } from "../../system/selinux";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";

/**
 * Extract context options from parsed args.
 */
export const getContextOptions = (args: ParsedArgs): ServiceContext<unknown>["options"] => ({
  dryRun: args.dryRun,
  verbose: args.verbose,
  force: args.force,
});

/**
 * Common config file locations for a service.
 * Search paths are plain strings (may be relative).
 */
const getConfigPaths = (serviceName: string, homeDir: AbsolutePathType): string[] => [
  pathJoin(homeDir, ".config", "divban", `${serviceName}.toml`),
  `/etc/divban/${serviceName}.toml`,
  `./divban-${serviceName}.toml`,
];

/**
 * Find and load a service configuration file.
 * Searches in common locations if no explicit path is provided.
 */
export const resolveServiceConfig = (
  service: AnyServiceEffect,
  homeDir: AbsolutePathType,
  explicitPath?: string
): Effect.Effect<unknown, ConfigError | SystemError> =>
  Effect.gen(function* () {
    // If explicit path provided, use it
    if (explicitPath) {
      const path = yield* toAbsolutePathEffect(explicitPath);
      return yield* loadServiceConfig(path, service.definition.configSchema);
    }

    // Search common locations
    const searchPaths = getConfigPaths(service.definition.name, homeDir);

    for (const p of searchPaths) {
      const file = Bun.file(p);
      const exists = yield* Effect.promise(() => file.exists());
      if (exists) {
        const path = yield* toAbsolutePathEffect(p);
        return yield* loadServiceConfig(path, service.definition.configSchema);
      }
    }

    // No config found
    return yield* Effect.fail(
      new ConfigError({
        code: ErrorCode.CONFIG_NOT_FOUND as 10,
        message: `No configuration file found for ${service.definition.name}. Searched: ${searchPaths.join(", ")}`,
      })
    );
  });

/**
 * Format duration for display.
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

/**
 * Format bytes for display.
 */
export const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
};

/**
 * Safely extract dataDir from config.
 * Service configs may have a paths.dataDir property.
 */
export const getDataDirFromConfig = (
  config: unknown,
  fallback: AbsolutePathType
): AbsolutePathType => {
  if (
    config !== null &&
    typeof config === "object" &&
    "paths" in config &&
    config.paths !== null &&
    typeof config.paths === "object" &&
    "dataDir" in config.paths &&
    typeof config.paths.dataDir === "string"
  ) {
    // Validate the path, falling back to default if invalid
    const pathResult = AbsolutePath(config.paths.dataDir);
    return pathResult.ok ? pathResult.value : fallback;
  }
  return fallback;
};

/**
 * Pad text to a specific display width using Bun.stringWidth().
 * Handles Unicode and emoji correctly.
 */
export const padToWidth = (text: string, width: number): string => {
  const currentWidth = Bun.stringWidth(text);
  return text + " ".repeat(Math.max(0, width - currentWidth));
};

/**
 * Truncate text to a maximum display width using Bun.stringWidth().
 * Handles Unicode and emoji correctly.
 */
export const truncateToWidth = (text: string, maxWidth: number): string => {
  if (Bun.stringWidth(text) <= maxWidth) {
    return text;
  }
  let result = "";
  for (const char of text) {
    if (Bun.stringWidth(result + char) > maxWidth - 1) {
      break;
    }
    result += char;
  }
  return `${result}…`;
};

/**
 * Detect system capabilities at runtime.
 * Used to determine SELinux status for volume relabeling.
 */
export const detectSystemCapabilities = (): Effect.Effect<
  SystemCapabilities,
  SystemError | GeneralError
> =>
  Effect.gen(function* () {
    const selinuxEnforcing = yield* isSELinuxEnforcing();
    return { selinuxEnforcing };
  });

// ============================================================================
// Service Context Builder
// ============================================================================

/**
 * Resolved service user information.
 */
export interface ServiceUser {
  name: Username;
  uid: UserId;
  gid: GroupId;
  homeDir: AbsolutePathType;
}

/**
 * Options for building a service context.
 */
export interface BuildContextOptions {
  service: AnyServiceEffect;
  args: ParsedArgs;
  logger: Logger;
  /** If true, returns error when config not found. Default: false */
  requireConfig?: boolean;
  /** Explicit config path (overrides search) */
  configPath?: string;
}

/**
 * Service context with resolved user information.
 */
export interface ContextWithUser<C> {
  ctx: ServiceContext<C>;
  user: ServiceUser;
}

/**
 * Resolve service user from system.
 * Returns error if user doesn't exist.
 */
export const resolveServiceUser = (
  serviceName: string
): Effect.Effect<ServiceUser, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const username = yield* getServiceUsername(serviceName);
    const userInfoResult = yield* Effect.either(getUserByName(username));

    if (userInfoResult._tag === "Left") {
      return yield* Effect.fail(
        new ServiceError({
          code: ErrorCode.SERVICE_NOT_FOUND as 30,
          message: `Service user '${username}' not found. Run 'divban ${serviceName} setup' first.`,
          service: serviceName,
        })
      );
    }

    const { uid, homeDir } = userInfoResult.right;
    return {
      name: username,
      uid,
      gid: userIdToGroupId(uid),
      homeDir,
    };
  });

/**
 * Build ServiceContext for commands that need an existing user.
 * Patterns A & B: User must exist, config may be optional or required.
 */
export const buildServiceContext = <C = unknown>(
  options: BuildContextOptions
): Effect.Effect<ContextWithUser<C>, ServiceError | ConfigError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const { service, args, logger, requireConfig = false, configPath } = options;

    // Resolve user first
    const user = yield* resolveServiceUser(service.definition.name);

    // Resolve config (may fail if not found)
    const configResult = yield* Effect.either(
      resolveServiceConfig(service, user.homeDir, configPath)
    );

    // Handle config based on requireConfig flag
    let config: C;
    if (configResult._tag === "Left") {
      if (requireConfig) {
        return yield* Effect.fail(configResult.left);
      }
      config = {} as C;
    } else {
      config = configResult.right as C;
    }

    // Build paths - dataDir depends on config
    const baseDataDir = userDataDir(user.homeDir);
    const dataDir =
      configResult._tag === "Right"
        ? getDataDirFromConfig(configResult.right, baseDataDir)
        : baseDataDir;

    // Use buildServicePaths for simple pattern, manual for config-required pattern
    const paths = requireConfig
      ? {
          dataDir,
          quadletDir: userQuadletDir(user.homeDir),
          configDir: userConfigDir(user.homeDir),
          homeDir: user.homeDir,
        }
      : buildServicePaths(user.homeDir, dataDir);

    // Detect system capabilities
    const system = yield* detectSystemCapabilities();

    // Build final context
    const ctx: ServiceContext<C> = {
      config,
      logger,
      paths,
      user: {
        name: user.name,
        uid: user.uid,
        gid: user.gid,
      },
      options: getContextOptions(args),
      system,
    };

    return { ctx, user };
  });
