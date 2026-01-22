// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Shared utilities for CLI commands.
 * Provides helpers for resolving service context using Effect's Layer pattern.
 */

import type { Context } from "effect";
import { Effect, Layer, Schema, pipe } from "effect";
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
import { toAbsolutePathEffect, userConfigDir, userDataDir, userQuadletDir } from "../../lib/paths";
import {
  AbsolutePathSchema,
  type AbsolutePath as AbsolutePathType,
  type GroupId,
  type UserId,
  type Username,
  pathJoin,
  userIdToGroupId,
} from "../../lib/types";
import {
  AppLogger,
  ServiceOptions,
  ServicePaths,
  ServiceUser,
  SystemCapabilities,
} from "../../services/context";
import type { AnyServiceEffect } from "../../services/types";
import { isSELinuxEnforcing } from "../../system/selinux";
import { getUserByName } from "../../system/user";
import type { ParsedArgs } from "../parser";

// ============================================================================
// Service Options
// ============================================================================

/**
 * Extract context options from parsed args.
 */
export const getContextOptions = (
  args: ParsedArgs
): { dryRun: boolean; verbose: boolean; force: boolean } => ({
  dryRun: args.dryRun,
  verbose: args.verbose,
  force: args.force,
});

// ============================================================================
// Config Resolution
// ============================================================================

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
 * Try to load config from a single path.
 */
const tryLoadConfigFromPath = (
  path: string,
  schema: Schema.Schema<unknown, unknown, never>
): Effect.Effect<unknown, ConfigError | SystemError> =>
  pipe(
    Effect.promise(() => Bun.file(path).exists()),
    Effect.flatMap((exists) =>
      exists
        ? pipe(
            toAbsolutePathEffect(path),
            Effect.flatMap((absPath) => loadServiceConfig(absPath, schema))
          )
        : Effect.fail(
            new ConfigError({
              code: ErrorCode.CONFIG_NOT_FOUND as 10,
              message: `Config not found at ${path}`,
            })
          )
    )
  );

/**
 * Find and load a service configuration file.
 */
export const resolveServiceConfig = (
  service: AnyServiceEffect,
  homeDir: AbsolutePathType,
  explicitPath?: string
): Effect.Effect<unknown, ConfigError | SystemError> =>
  explicitPath !== undefined
    ? pipe(
        toAbsolutePathEffect(explicitPath),
        Effect.flatMap((path) => loadServiceConfig(path, service.definition.configSchema))
      )
    : pipe(
        Effect.firstSuccessOf(
          getConfigPaths(service.definition.name, homeDir).map((p) =>
            tryLoadConfigFromPath(p, service.definition.configSchema)
          )
        ),
        Effect.catchAll(() =>
          Effect.fail(
            new ConfigError({
              code: ErrorCode.CONFIG_NOT_FOUND as 10,
              message: `No configuration file found for ${service.definition.name}. Searched: ${getConfigPaths(service.definition.name, homeDir).join(", ")}`,
            })
          )
        )
      );

// ============================================================================
// Formatting Utilities
// ============================================================================

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
    return Schema.is(AbsolutePathSchema)(config.paths.dataDir) ? config.paths.dataDir : fallback;
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

// ============================================================================
// System Capabilities
// ============================================================================

/**
 * Detect system capabilities at runtime.
 * Used to determine SELinux status for volume relabeling.
 */
export const detectSystemCapabilities = (): Effect.Effect<
  { selinuxEnforcing: boolean },
  SystemError | GeneralError
> =>
  Effect.gen(function* () {
    const selinuxEnforcing = yield* isSELinuxEnforcing();
    return { selinuxEnforcing };
  });

// ============================================================================
// Service User Resolution
// ============================================================================

/**
 * Resolved service user information.
 */
export interface ResolvedServiceUser {
  name: Username;
  uid: UserId;
  gid: GroupId;
  homeDir: AbsolutePathType;
}

/**
 * Resolve service user from system.
 * Returns error if user doesn't exist.
 */
export const resolveServiceUser = (
  serviceName: string
): Effect.Effect<ResolvedServiceUser, ServiceError | SystemError | GeneralError> =>
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

// ============================================================================
// Layer Building
// ============================================================================

/**
 * Prerequisites resolved for a service command.
 */
export interface Prerequisites<C> {
  user: ResolvedServiceUser;
  config: C;
  system: { selinuxEnforcing: boolean };
  paths: {
    dataDir: AbsolutePathType;
    quadletDir: AbsolutePathType;
    configDir: AbsolutePathType;
    homeDir: AbsolutePathType;
  };
}

/**
 * Build service paths from home directory and optional data dir override.
 */
export const buildServicePathsFromHome = (
  homeDir: AbsolutePathType,
  dataDirOverride?: AbsolutePathType
): {
  dataDir: AbsolutePathType;
  quadletDir: AbsolutePathType;
  configDir: AbsolutePathType;
  homeDir: AbsolutePathType;
} => {
  const dataDir = dataDirOverride ?? userDataDir(homeDir);
  return {
    dataDir,
    quadletDir: userQuadletDir(homeDir),
    configDir: userConfigDir(homeDir),
    homeDir,
  };
};

/**
 * Resolve all prerequisites for a service command.
 * Returns user, config, system capabilities, and paths.
 */
export const resolvePrerequisites = <C>(
  service: AnyServiceEffect,
  configPath: string | undefined,
  dataDirOverride?: string
): Effect.Effect<Prerequisites<C>, ServiceError | ConfigError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const user = yield* resolveServiceUser(service.definition.name);
    const effectiveConfigPath = configPath ?? undefined;
    const config = (yield* resolveServiceConfig(service, user.homeDir, effectiveConfigPath)) as C;
    const system = yield* detectSystemCapabilities();

    // Get dataDir from config if available, otherwise use default
    const baseDataDir = userDataDir(user.homeDir);
    const configDataDir = getDataDirFromConfig(config, baseDataDir);
    const finalDataDir = dataDirOverride ? (dataDirOverride as AbsolutePathType) : configDataDir;

    const paths = buildServicePathsFromHome(user.homeDir, finalDataDir);
    return { user, config, system, paths };
  });

/**
 * Resolve prerequisites with optional config (config may not exist).
 */
export const resolvePrerequisitesOptionalConfig = <C>(
  service: AnyServiceEffect,
  configPath: string | undefined,
  dataDirOverride?: string
): Effect.Effect<
  Prerequisites<C | Record<string, never>>,
  ServiceError | SystemError | GeneralError
> =>
  Effect.gen(function* () {
    const user = yield* resolveServiceUser(service.definition.name);
    const configResult = yield* Effect.either(
      resolveServiceConfig(service, user.homeDir, configPath)
    );

    const config =
      configResult._tag === "Right" ? (configResult.right as C) : ({} as Record<string, never>);
    const system = yield* detectSystemCapabilities();

    // Get dataDir from config if available, otherwise use default
    const baseDataDir = userDataDir(user.homeDir);
    const configDataDir =
      configResult._tag === "Right"
        ? getDataDirFromConfig(configResult.right, baseDataDir)
        : baseDataDir;
    const finalDataDir = dataDirOverride ? (dataDirOverride as AbsolutePathType) : configDataDir;

    const paths = buildServicePathsFromHome(user.homeDir, finalDataDir);
    return { user, config, system, paths };
  });

/**
 * Create a Layer from resolved prerequisites and a service config tag.
 */
export const createServiceLayer = <C, ConfigTag extends Context.Tag<ConfigTag, C>>(
  config: C,
  configTag: ConfigTag,
  prereqs: Prerequisites<C>,
  options: { dryRun: boolean; verbose: boolean; force: boolean },
  logger: Logger
): Layer.Layer<
  | Context.Tag.Identifier<ConfigTag>
  | ServicePaths
  | ServiceUser
  | ServiceOptions
  | SystemCapabilities
  | AppLogger
> =>
  Layer.mergeAll(
    Layer.succeed(configTag, config),
    Layer.succeed(ServicePaths, prereqs.paths),
    Layer.succeed(ServiceUser, {
      name: prereqs.user.name,
      uid: prereqs.user.uid,
      gid: prereqs.user.gid,
    }),
    Layer.succeed(ServiceOptions, options),
    Layer.succeed(SystemCapabilities, prereqs.system),
    Layer.succeed(AppLogger, logger)
  );

/**
 * Create a Layer without service-specific config.
 * Used for commands that don't need the full config.
 */
export const createMinimalServiceLayer = (
  prereqs: Prerequisites<unknown>,
  options: { dryRun: boolean; verbose: boolean; force: boolean },
  logger: Logger
): Layer.Layer<ServicePaths | ServiceUser | ServiceOptions | SystemCapabilities | AppLogger> =>
  Layer.mergeAll(
    Layer.succeed(ServicePaths, prereqs.paths),
    Layer.succeed(ServiceUser, {
      name: prereqs.user.name,
      uid: prereqs.user.uid,
      gid: prereqs.user.gid,
    }),
    Layer.succeed(ServiceOptions, options),
    Layer.succeed(SystemCapabilities, prereqs.system),
    Layer.succeed(AppLogger, logger)
  );
