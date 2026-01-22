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
  type ServiceName,
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
const getConfigPaths = (serviceName: ServiceName, homeDir: AbsolutePathType): string[] => [
  pathJoin(homeDir, ".config", "divban", `${serviceName}.toml`),
  `/etc/divban/${serviceName}.toml`,
  `./divban-${serviceName}.toml`,
];

/**
 * Try to load config from a single path with typed schema.
 */
const tryLoadConfigFromPath = <C>(
  path: string,
  // biome-ignore lint/suspicious/noExplicitAny: Type parameter any is acceptable for schema input type
  schema: Schema.Schema<C, any, never>
): Effect.Effect<C, ConfigError | SystemError> =>
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
 * Search common config locations and load with typed schema.
 * Used when no explicit config path is provided.
 */
export const findAndLoadConfig = <C>(
  serviceName: ServiceName,
  homeDir: AbsolutePathType,
  // biome-ignore lint/suspicious/noExplicitAny: Type parameter any is acceptable for schema input type
  schema: Schema.Schema<C, any, never>
): Effect.Effect<C, ConfigError | SystemError> =>
  pipe(
    Effect.firstSuccessOf(
      getConfigPaths(serviceName, homeDir).map((p) => tryLoadConfigFromPath(p, schema))
    ),
    Effect.catchAll(() =>
      Effect.fail(
        new ConfigError({
          code: ErrorCode.CONFIG_NOT_FOUND as 10,
          message: `No configuration file found for ${serviceName}. Searched: ${getConfigPaths(serviceName, homeDir).join(", ")}`,
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
 * Interface for configs that may have a paths.dataDir property.
 */
interface ConfigWithPaths {
  paths?: { dataDir?: string };
}

/**
 * Type guard to check if config has paths.dataDir property.
 */
const hasPathsWithDataDir = (config: object): config is ConfigWithPaths =>
  "paths" in config &&
  config.paths !== null &&
  typeof config.paths === "object" &&
  "dataDir" in config.paths &&
  typeof config.paths.dataDir === "string";

/**
 * Safely extract dataDir from config.
 * Service configs may have a paths.dataDir property.
 */
export const getDataDirFromConfig = <C extends object>(
  config: C,
  fallback: AbsolutePathType
): AbsolutePathType => {
  if (hasPathsWithDataDir(config)) {
    const dataDir = config.paths?.dataDir;
    if (dataDir !== undefined && Schema.is(AbsolutePathSchema)(dataDir)) {
      return dataDir;
    }
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

/** State for width-bounded truncation */
type TruncState = { readonly width: number; readonly chars: readonly string[] };

/** Step function: accumulate chars while under width limit */
const truncStep =
  (maxWidth: number) =>
  (state: TruncState, c: string): TruncState => {
    const charWidth = Bun.stringWidth(c);
    return state.width + charWidth > maxWidth - 1
      ? state
      : { width: state.width + charWidth, chars: [...state.chars, c] };
  };

/**
 * Truncate text to a maximum display width using Bun.stringWidth().
 * Handles Unicode and emoji correctly.
 */
export const truncateToWidth = (text: string, maxWidth: number): string =>
  Bun.stringWidth(text) <= maxWidth
    ? text
    : `${Array.from(text).reduce(truncStep(maxWidth), { width: 0, chars: [] }).chars.join("")}…`;

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
  serviceName: ServiceName
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
 * Prerequisites resolved for a service command (without config).
 * Config is loaded inside the existential apply() with proper typing.
 */
export interface Prerequisites {
  user: ResolvedServiceUser;
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
 * Resolve user, system capabilities, and paths for a service.
 * Config loading is handled separately inside apply().
 */
export const resolvePrerequisites = (
  serviceName: ServiceName,
  dataDirOverride: string | null
): Effect.Effect<Prerequisites, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const user = yield* resolveServiceUser(serviceName);
    const system = yield* detectSystemCapabilities();
    const baseDataDir = userDataDir(user.homeDir);
    const finalDataDir =
      dataDirOverride !== null ? (dataDirOverride as AbsolutePathType) : baseDataDir;
    const paths = buildServicePathsFromHome(user.homeDir, finalDataDir);
    return { user, system, paths };
  });

/**
 * Create a Layer from resolved prerequisites and a service config tag.
 */
export const createServiceLayer = <C, I, ConfigTag extends Context.Tag<I, C>>(
  config: C,
  configTag: ConfigTag,
  prereqs: Prerequisites,
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
