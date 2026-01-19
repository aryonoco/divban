// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Shared utilities for CLI commands.
 */

import { normalize, resolve } from "node:path";
import { loadServiceConfig } from "../../config/loader";
import { getServiceUsername } from "../../config/schema";
import { DivbanError, ErrorCode } from "../../lib/errors";
import type { Logger } from "../../lib/logger";
import { buildServicePaths, userConfigDir, userDataDir, userQuadletDir } from "../../lib/paths";
import {
  Err,
  Ok,
  type Result,
  asyncFlatMapResult,
  mapErr,
  mapResult,
  orElse,
} from "../../lib/result";
import {
  type AbsolutePath,
  type GroupId,
  type UserId,
  type Username,
  pathJoin,
  userIdToGroupId,
} from "../../lib/types";
import type { AnyService, ServiceContext, SystemCapabilities } from "../../services/types";
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
 * Resolve a path to absolute with security validation.
 * Rejects null bytes and validates normalization.
 */
const toAbsolute = (p: string): Result<AbsolutePath, DivbanError> => {
  // Reject null bytes (path injection attack)
  if (p.includes("\x00")) {
    return Err(new DivbanError(ErrorCode.INVALID_ARGS, `Invalid path contains null byte: ${p}`));
  }

  // Normalize to resolve ../ sequences, then make absolute
  const normalized = normalize(p);
  const absolute = normalized.startsWith("/") ? normalized : resolve(process.cwd(), normalized);

  return Ok(absolute as AbsolutePath);
};

/**
 * Common config file locations for a service.
 * Search paths are plain strings (may be relative).
 */
const getConfigPaths = (serviceName: string, homeDir: AbsolutePath): string[] => [
  pathJoin(homeDir, ".config", "divban", `${serviceName}.toml`),
  `/etc/divban/${serviceName}.toml`,
  `./divban-${serviceName}.toml`,
];

/**
 * Find and load a service configuration file.
 * Searches in common locations if no explicit path is provided.
 */
export const resolveServiceConfig = async (
  service: AnyService,
  homeDir: AbsolutePath,
  explicitPath?: string
): Promise<Result<unknown, DivbanError>> => {
  // If explicit path provided, use it
  if (explicitPath) {
    return asyncFlatMapResult(toAbsolute(explicitPath), (path) =>
      loadServiceConfig(path, service.definition.configSchema)
    );
  }

  // Search common locations
  const searchPaths = getConfigPaths(service.definition.name, homeDir);

  for (const p of searchPaths) {
    const file = Bun.file(p);
    if (await file.exists()) {
      return asyncFlatMapResult(toAbsolute(p), (path) =>
        loadServiceConfig(path, service.definition.configSchema)
      );
    }
  }

  // No config found - this might be OK for some operations
  return Err(
    new DivbanError(
      ErrorCode.CONFIG_NOT_FOUND,
      `No configuration file found for ${service.definition.name}. Searched: ${searchPaths.join(", ")}`
    )
  );
};

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
export const getDataDirFromConfig = (config: unknown, fallback: AbsolutePath): AbsolutePath => {
  if (
    config !== null &&
    typeof config === "object" &&
    "paths" in config &&
    config.paths !== null &&
    typeof config.paths === "object" &&
    "dataDir" in config.paths &&
    typeof config.paths.dataDir === "string"
  ) {
    return config.paths.dataDir as AbsolutePath;
  }
  return fallback;
};

/**
 * Pad text to a specific display width using Bun.stringWidth().
 * Handles Unicode and emoji correctly (6,756x faster than npm packages).
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
export const detectSystemCapabilities = async (): Promise<SystemCapabilities> => ({
  selinuxEnforcing: await isSELinuxEnforcing(),
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
  homeDir: AbsolutePath;
}

/**
 * Options for building a service context.
 */
export interface BuildContextOptions {
  service: AnyService;
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
 *
 * Uses asyncFlatMapResult to chain: getServiceUsername → getUserByName → transform
 */
export const resolveServiceUser = (
  serviceName: string
): Promise<Result<ServiceUser, DivbanError>> =>
  asyncFlatMapResult(getServiceUsername(serviceName), async (username) =>
    mapResult(
      mapErr(
        await getUserByName(username),
        () =>
          new DivbanError(
            ErrorCode.SERVICE_NOT_FOUND,
            `Service user '${username}' not found. Run 'divban ${serviceName} setup' first.`
          )
      ),
      ({ uid, homeDir }) => ({
        name: username,
        uid,
        gid: userIdToGroupId(uid),
        homeDir,
      })
    )
  );

/**
 * Build ServiceContext for commands that need an existing user.
 * Patterns A & B: User must exist, config may be optional or required.
 *
 * Uses asyncFlatMapResult for the main chain, orElse for config fallback.
 */
export const buildServiceContext = async <C = unknown>(
  options: BuildContextOptions
): Promise<Result<ContextWithUser<C>, DivbanError>> => {
  const { service, args, logger, requireConfig = false, configPath } = options;

  // Chain: resolveUser → resolveConfig → buildContext
  return asyncFlatMapResult(await resolveServiceUser(service.definition.name), async (user) => {
    const configResult = await resolveServiceConfig(service, user.homeDir, configPath);

    // Use orElse for optional config fallback (Pattern A)
    // For requireConfig (Pattern B), propagate error
    const config = requireConfig ? configResult : orElse(configResult, () => Ok({} as C));

    if (!config.ok) {
      return config;
    }

    // Build paths - dataDir depends on config
    const baseDataDir = userDataDir(user.homeDir);
    const dataDir = configResult.ok
      ? getDataDirFromConfig(configResult.value, baseDataDir)
      : baseDataDir;

    // Use buildServicePaths for simple pattern, manual for config-required pattern
    const paths = requireConfig
      ? {
          dataDir,
          quadletDir: userQuadletDir(user.homeDir),
          configDir: userConfigDir(user.homeDir),
        }
      : buildServicePaths(user.homeDir, dataDir);

    // Build final context
    const ctx: ServiceContext<C> = {
      config: config.value as C,
      logger,
      paths,
      user: {
        name: user.name,
        uid: user.uid,
        gid: user.gid,
      },
      options: getContextOptions(args),
      system: await detectSystemCapabilities(),
    };

    return Ok({ ctx, user });
  });
};
