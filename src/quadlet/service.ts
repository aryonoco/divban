// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * [Service] section builder for quadlet files.
 */

import type { Entries } from "./entry";
import { concat, fromValue } from "./entry-combinators";
import type { IniSection } from "./format";
import { makeSection } from "./section-factory";
import type { ServiceConfig } from "./types";

export const getServiceSectionEntries = (config: ServiceConfig): Entries =>
  concat(
    fromValue("Restart", config.restart),
    fromValue("RestartSec", config.restartSec),
    fromValue("TimeoutStartSec", config.timeoutStartSec),
    fromValue("TimeoutStopSec", config.timeoutStopSec)
  );

/**
 * Build the [Service] section for a quadlet file.
 */
export const buildServiceSection: (config: ServiceConfig) => IniSection = makeSection(
  "Service",
  getServiceSectionEntries
);

/**
 * Create a default service configuration.
 */
export const defaultServiceConfig = (): ServiceConfig => ({
  restart: "on-failure",
  restartSec: 10,
  timeoutStartSec: 900,
  timeoutStopSec: 70,
});

/**
 * Merge service configurations with defaults.
 * Always falls back to system defaults for undefined values.
 */
export const mergeServiceConfig = (
  config: Partial<ServiceConfig>,
  stackDefaults: Partial<ServiceConfig> = {}
): ServiceConfig => {
  const systemDefaults = defaultServiceConfig();

  return {
    restart: config.restart ?? stackDefaults.restart ?? systemDefaults.restart ?? "on-failure",
    restartSec: config.restartSec ?? stackDefaults.restartSec ?? systemDefaults.restartSec,
    timeoutStartSec:
      config.timeoutStartSec ?? stackDefaults.timeoutStartSec ?? systemDefaults.timeoutStartSec,
    timeoutStopSec:
      config.timeoutStopSec ?? stackDefaults.timeoutStopSec ?? systemDefaults.timeoutStopSec,
  };
};
