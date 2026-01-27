// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Command context resolution. Builds the Layer dependencies that
 * service methods need - user info, paths, capabilities, logger.
 * Centralizes the boilerplate so each command focuses on its
 * specific logic rather than context setup.
 */

import type { Context } from "effect";
import { Array as Arr, Effect, Layer, Option, Schema, pipe } from "effect";
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

const tryLoadConfigFromPath = <C>(
  path: string,
  // biome-ignore lint/suspicious/noExplicitAny: Schema input varies per service - validated at runtime
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
  // biome-ignore lint/suspicious/noExplicitAny: Schema input varies per service - validated at runtime
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

/** Threshold entry for data-driven formatting */
interface ThresholdEntry<T> {
  readonly threshold: number;
  readonly format: (value: T) => string;
}

/** Duration formatting thresholds (descending order) */
const DURATION_THRESHOLDS: readonly ThresholdEntry<number>[] = [
  {
    threshold: 60000,
    format: (ms): string => {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    },
  },
  { threshold: 1000, format: (ms): string => `${(ms / 1000).toFixed(1)}s` },
];

export const formatDuration = (ms: number): string =>
  pipe(
    DURATION_THRESHOLDS,
    Arr.findFirst((t) => ms >= t.threshold),
    Option.match({
      onNone: (): string => `${ms}ms`,
      onSome: (t): string => t.format(ms),
    })
  );

/** Byte formatting thresholds (descending order) */
const BYTE_THRESHOLDS: readonly ThresholdEntry<number>[] = [
  { threshold: 1024 ** 3, format: (b): string => `${(b / 1024 ** 3).toFixed(2)} GB` },
  { threshold: 1024 ** 2, format: (b): string => `${(b / 1024 ** 2).toFixed(2)} MB` },
  { threshold: 1024, format: (b): string => `${(b / 1024).toFixed(2)} KB` },
];

export const formatBytes = (bytes: number): string =>
  pipe(
    BYTE_THRESHOLDS,
    Arr.findFirst((t) => bytes >= t.threshold),
    Option.match({
      onNone: (): string => `${bytes} B`,
      onSome: (t): string => t.format(bytes),
    })
  );

interface ConfigWithPaths {
  paths?: { dataDir?: string };
}

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
): AbsolutePathType =>
  pipe(
    Option.liftPredicate(hasPathsWithDataDir)(config),
    Option.flatMap((c) => Option.fromNullable(c.paths?.dataDir)),
    Option.filter(Schema.is(AbsolutePathSchema)),
    Option.getOrElse(() => fallback)
  );

/**
 * Load service config with fallback for commands that don't require it.
 * On success: returns parsed config + updated paths (with dataDir from config).
 * On failure: returns empty config + original paths (service still operable).
 */
export const loadConfigOrFallback = <C extends object>(
  serviceName: ServiceName,
  homeDir: AbsolutePathType,
  // biome-ignore lint/suspicious/noExplicitAny: Schema input varies per service
  schema: Schema.Schema<C, any, never>,
  prereqs: Prerequisites
): Effect.Effect<{ config: C; paths: Prerequisites["paths"] }, never> =>
  findAndLoadConfig(serviceName, homeDir, schema).pipe(
    Effect.map((cfg) => ({
      config: cfg,
      paths: {
        ...prereqs.paths,
        dataDir: getDataDirFromConfig(cfg, prereqs.paths.dataDir),
      },
    })),
    Effect.orElseSucceed(() => ({
      config: {} as C,
      paths: prereqs.paths,
    }))
  );

/**
 * Pad text to a specific display width using Bun.stringWidth().
 * Handles Unicode and emoji correctly.
 */
export const padToWidth = (text: string, width: number): string => {
  const currentWidth = Bun.stringWidth(text);
  return text + " ".repeat(Math.max(0, width - currentWidth));
};

type TruncState = { readonly width: number; readonly chars: readonly string[] };

/** Required for Arr.reduce - returns unchanged state once width limit reached */
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

export interface ResolvedServiceUser {
  name: Username;
  uid: UserId;
  gid: GroupId;
  homeDir: AbsolutePathType;
}

export const resolveServiceUser = (
  serviceName: ServiceName
): Effect.Effect<ResolvedServiceUser, ServiceError | SystemError | GeneralError> =>
  Effect.gen(function* () {
    const username = yield* getServiceUsername(serviceName);
    const { uid, homeDir } = yield* getUserByName(username).pipe(
      Effect.mapError(
        () =>
          new ServiceError({
            code: ErrorCode.SERVICE_NOT_FOUND as 30,
            message: `Service user '${username}' not found. Run 'divban setup ${serviceName}' first.`,
            service: serviceName,
          })
      )
    );
    return { name: username, uid, gid: userIdToGroupId(uid), homeDir };
  });

// ============================================================================
// Layer Building
// ============================================================================

/**
 * Prerequisites resolved for a service command (without config).
 * Config is loaded with the correct schema for each service.
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
): Effect.Effect<Prerequisites, ServiceError | SystemError | GeneralError | ConfigError> =>
  Effect.gen(function* () {
    const user = yield* resolveServiceUser(serviceName);
    const system = yield* detectSystemCapabilities();
    const baseDataDir = userDataDir(user.homeDir);
    const finalDataDir =
      dataDirOverride !== null ? yield* toAbsolutePathEffect(dataDirOverride) : baseDataDir;
    const paths = buildServicePathsFromHome(user.homeDir, finalDataDir);
    return { user, system, paths };
  });

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
