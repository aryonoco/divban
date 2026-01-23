// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Sysctl service using Context.Tag pattern.
 * Wraps all functions from src/system/sysctl.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  DEFAULT_UNPRIVILEGED_PORT_START,
  configureUnprivilegedPorts,
  ensureUnprivilegedPorts,
  getUnprivilegedPortStart,
  isUnprivilegedPortEnabled,
} from "../sysctl";

/**
 * Sysctl service interface - provides sysctl configuration via Effect DI.
 * Enables unprivileged users to bind to ports >= configured threshold.
 */
export interface SysctlService {
  readonly DEFAULT_UNPRIVILEGED_PORT_START: typeof DEFAULT_UNPRIVILEGED_PORT_START;
  readonly getUnprivilegedPortStart: typeof getUnprivilegedPortStart;
  readonly isUnprivilegedPortEnabled: typeof isUnprivilegedPortEnabled;
  readonly configureUnprivilegedPorts: typeof configureUnprivilegedPorts;
  readonly ensureUnprivilegedPorts: typeof ensureUnprivilegedPorts;
}

/**
 * Sysctl service identifier for Effect dependency injection.
 */
export interface Sysctl {
  readonly _tag: "Sysctl";
}

/**
 * Sysctl context tag.
 * Use with `yield* Sysctl` to access the service in Effect generators.
 */
export const Sysctl: Context.Tag<Sysctl, SysctlService> = Context.GenericTag<Sysctl, SysctlService>(
  "divban/Sysctl"
);

/**
 * Sysctl live layer with all implementations.
 */
export const SysctlLive: Layer.Layer<Sysctl> = Layer.succeed(Sysctl, {
  DEFAULT_UNPRIVILEGED_PORT_START,
  getUnprivilegedPortStart,
  isUnprivilegedPortEnabled,
  configureUnprivilegedPorts,
  ensureUnprivilegedPorts,
});
