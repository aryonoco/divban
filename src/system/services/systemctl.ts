// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * SystemCtl service using Context.Tag pattern.
 * Wraps all functions from src/system/systemctl.ts for dependency injection.
 * Works with isolatedDeclarations: true.
 */

import { Context, Layer } from "effect";
import {
  daemonReload,
  disableService,
  enableService,
  getServiceStatus,
  isServiceActive,
  isServiceEnabled,
  journalctl,
  reloadService,
  restartService,
  startService,
  stopService,
  systemctl,
} from "../systemctl";

/**
 * SystemCtl service interface - provides systemd systemctl operations via Effect DI.
 */
export interface SystemCtlService {
  // Base systemctl
  readonly systemctl: typeof systemctl;

  // Service lifecycle
  readonly startService: typeof startService;
  readonly stopService: typeof stopService;
  readonly restartService: typeof restartService;
  readonly reloadService: typeof reloadService;

  // Enable/disable
  readonly enableService: typeof enableService;
  readonly disableService: typeof disableService;

  // Status checks
  readonly isServiceActive: typeof isServiceActive;
  readonly isServiceEnabled: typeof isServiceEnabled;
  readonly getServiceStatus: typeof getServiceStatus;

  // Daemon management
  readonly daemonReload: typeof daemonReload;
  readonly journalctl: typeof journalctl;
}

/**
 * SystemCtl service identifier for Effect dependency injection.
 */
export interface SystemCtl {
  readonly _tag: "SystemCtl";
}

/**
 * SystemCtl context tag.
 * Use with `yield* SystemCtl` to access the service in Effect generators.
 */
export const SystemCtl: Context.Tag<SystemCtl, SystemCtlService> = Context.GenericTag<
  SystemCtl,
  SystemCtlService
>("divban/SystemCtl");

/**
 * SystemCtl live layer with all implementations.
 */
export const SystemCtlLive: Layer.Layer<SystemCtl> = Layer.succeed(SystemCtl, {
  // Base systemctl
  systemctl,

  // Service lifecycle
  startService,
  stopService,
  restartService,
  reloadService,

  // Enable/disable
  enableService,
  disableService,

  // Status checks
  isServiceActive,
  isServiceEnabled,
  getServiceStatus,

  // Daemon management
  daemonReload,
  journalctl,
});
