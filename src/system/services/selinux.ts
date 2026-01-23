// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * SELinux service using Context.Tag pattern.
 * Wraps all functions from src/system/selinux.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import { getSELinuxMode, isSELinuxEnforcing } from "../selinux";

/**
 * SELinux service interface - provides SELinux detection via Effect DI.
 * Runtime detection of SELinux status for conditional volume relabeling.
 */
export interface SELinuxService {
  readonly getSELinuxMode: typeof getSELinuxMode;
  readonly isSELinuxEnforcing: typeof isSELinuxEnforcing;
}

/**
 * SELinux service identifier for Effect dependency injection.
 */
export interface SELinux {
  readonly _tag: "SELinux";
}

/**
 * SELinux context tag.
 * Use with `yield* SELinux` to access the service in Effect generators.
 */
export const SELinux: Context.Tag<SELinux, SELinuxService> = Context.GenericTag<
  SELinux,
  SELinuxService
>("divban/SELinux");

/**
 * SELinux live layer with all implementations.
 */
export const SELinuxLive: Layer.Layer<SELinux> = Layer.succeed(SELinux, {
  getSELinuxMode,
  isSELinuxEnforcing,
});
