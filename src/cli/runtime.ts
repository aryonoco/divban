// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * CLI application runtime using Effect's Layer and ManagedRuntime.
 * Provides context building for CLI commands.
 */

import type { Context } from "effect";
import { Layer } from "effect";
import type { Logger } from "../lib/logger";
import type { AbsolutePath, GroupId, UserId, Username } from "../lib/types";
import {
  AppLogger,
  ServiceOptions,
  ServicePaths,
  ServiceUser,
  SystemCapabilities,
} from "../services/context";

/**
 * Service paths configuration for a command.
 */
export interface ServicePathsConfig {
  readonly dataDir: AbsolutePath;
  readonly quadletDir: AbsolutePath;
  readonly configDir: AbsolutePath;
  readonly homeDir: AbsolutePath;
}

/**
 * Service user configuration for a command.
 */
export interface ServiceUserConfig {
  readonly name: Username;
  readonly uid: UserId;
  readonly gid: GroupId;
}

/**
 * Service options for a command.
 */
export interface ServiceOptionsConfig {
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly force: boolean;
}

/**
 * System capabilities for a command.
 */
export interface SystemCapabilitiesConfig {
  readonly selinuxEnforcing: boolean;
}

/**
 * Create runtime context layer for a specific service invocation.
 * This provides the per-command context that service methods access via yield*.
 */
export const createCommandLayer = <C, ConfigTag extends Context.Tag<ConfigTag, C>>(
  config: C,
  configTag: ConfigTag,
  paths: ServicePathsConfig,
  user: ServiceUserConfig,
  options: ServiceOptionsConfig,
  system: SystemCapabilitiesConfig,
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
    Layer.succeed(ServicePaths, paths),
    Layer.succeed(ServiceUser, user),
    Layer.succeed(ServiceOptions, options),
    Layer.succeed(SystemCapabilities, system),
    Layer.succeed(AppLogger, logger)
  );

/**
 * Create a minimal layer without service-specific config.
 * Used for commands that don't need the full config (e.g., status).
 */
export const createMinimalLayer = (
  paths: ServicePathsConfig,
  user: ServiceUserConfig,
  options: ServiceOptionsConfig,
  system: SystemCapabilitiesConfig,
  logger: Logger
): Layer.Layer<ServicePaths | ServiceUser | ServiceOptions | SystemCapabilities | AppLogger> =>
  Layer.mergeAll(
    Layer.succeed(ServicePaths, paths),
    Layer.succeed(ServiceUser, user),
    Layer.succeed(ServiceOptions, options),
    Layer.succeed(SystemCapabilities, system),
    Layer.succeed(AppLogger, logger)
  );
