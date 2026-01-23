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

export interface ServicePathsValue {
  readonly dataDir: AbsolutePath;
  readonly quadletDir: AbsolutePath;
  readonly configDir: AbsolutePath;
  readonly homeDir: AbsolutePath;
}

export interface ServicePaths {
  readonly _tag: "ServicePaths";
}

export const ServicePaths: Context.Tag<ServicePaths, ServicePathsValue> = Context.GenericTag<
  ServicePaths,
  ServicePathsValue
>("divban/ServicePaths");

export interface ServiceUserValue {
  readonly name: Username;
  readonly uid: UserId;
  readonly gid: GroupId;
}

export interface ServiceUser {
  readonly _tag: "ServiceUser";
}

export const ServiceUser: Context.Tag<ServiceUser, ServiceUserValue> = Context.GenericTag<
  ServiceUser,
  ServiceUserValue
>("divban/ServiceUser");

export interface ServiceOptionsValue {
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly force: boolean;
}

export interface ServiceOptions {
  readonly _tag: "ServiceOptions";
}

export const ServiceOptions: Context.Tag<ServiceOptions, ServiceOptionsValue> = Context.GenericTag<
  ServiceOptions,
  ServiceOptionsValue
>("divban/ServiceOptions");

export interface SystemCapabilitiesValue {
  readonly selinuxEnforcing: boolean;
}

export interface SystemCapabilities {
  readonly _tag: "SystemCapabilities";
}

export const SystemCapabilities: Context.Tag<SystemCapabilities, SystemCapabilitiesValue> =
  Context.GenericTag<SystemCapabilities, SystemCapabilitiesValue>("divban/SystemCapabilities");

export interface AppLogger {
  readonly _tag: "AppLogger";
}

export const AppLogger: Context.Tag<AppLogger, Logger> = Context.GenericTag<AppLogger, Logger>(
  "divban/AppLogger"
);
