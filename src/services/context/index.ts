// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Runtime context services for per-invocation data.
 * Uses Context.GenericTag for isolatedDeclarations: true compatibility.
 * These hold per-invocation data, not service implementations.
 */

import { Context } from "effect";
import type { Logger } from "../../lib/logger";
import type { AbsolutePath, GroupId, UserId, Username } from "../../lib/types";

/**
 * Service filesystem paths value type.
 */
export interface ServicePathsValue {
  readonly dataDir: AbsolutePath;
  readonly quadletDir: AbsolutePath;
  readonly configDir: AbsolutePath;
  readonly homeDir: AbsolutePath;
}

/**
 * ServicePaths tag identifier type.
 */
export interface ServicePaths {
  readonly _tag: "ServicePaths";
}

/**
 * Service filesystem paths context.
 * Provides paths to data, quadlet, config, and home directories.
 */
export const ServicePaths: Context.Tag<ServicePaths, ServicePathsValue> = Context.GenericTag<
  ServicePaths,
  ServicePathsValue
>("divban/ServicePaths");

/**
 * Service user value type.
 */
export interface ServiceUserValue {
  readonly name: Username;
  readonly uid: UserId;
  readonly gid: GroupId;
}

/**
 * ServiceUser tag identifier type.
 */
export interface ServiceUser {
  readonly _tag: "ServiceUser";
}

/**
 * Service user context.
 * Provides user identity information for running operations as service user.
 */
export const ServiceUser: Context.Tag<ServiceUser, ServiceUserValue> = Context.GenericTag<
  ServiceUser,
  ServiceUserValue
>("divban/ServiceUser");

/**
 * Service options value type.
 */
export interface ServiceOptionsValue {
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly force: boolean;
}

/**
 * ServiceOptions tag identifier type.
 */
export interface ServiceOptions {
  readonly _tag: "ServiceOptions";
}

/**
 * Service options context.
 * Provides global CLI options for controlling behavior.
 */
export const ServiceOptions: Context.Tag<ServiceOptions, ServiceOptionsValue> = Context.GenericTag<
  ServiceOptions,
  ServiceOptionsValue
>("divban/ServiceOptions");

/**
 * System capabilities value type.
 */
export interface SystemCapabilitiesValue {
  readonly selinuxEnforcing: boolean;
}

/**
 * SystemCapabilities tag identifier type.
 */
export interface SystemCapabilities {
  readonly _tag: "SystemCapabilities";
}

/**
 * System capabilities context.
 * Provides runtime-detected system capabilities.
 */
export const SystemCapabilities: Context.Tag<SystemCapabilities, SystemCapabilitiesValue> =
  Context.GenericTag<SystemCapabilities, SystemCapabilitiesValue>("divban/SystemCapabilities");

/**
 * AppLogger tag identifier type.
 */
export interface AppLogger {
  readonly _tag: "AppLogger";
}

/**
 * Application logger context.
 * Provides structured logging throughout the application.
 */
export const AppLogger: Context.Tag<AppLogger, Logger> = Context.GenericTag<AppLogger, Logger>(
  "divban/AppLogger"
);
