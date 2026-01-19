// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * [Service] section builder for quadlet files.
 */

import { fromUndefined } from "../lib/option";
import type { IniSection } from "./format";
import { addEntry } from "./format";
import type { ServiceConfig } from "./types";

/**
 * Build the [Service] section for a quadlet file.
 */
export const buildServiceSection = (config: ServiceConfig): IniSection => {
  const entries: Array<{ key: string; value: string }> = [];

  addEntry(entries, "Restart", config.restart);
  addEntry(entries, "RestartSec", config.restartSec);
  addEntry(entries, "TimeoutStartSec", config.timeoutStartSec);
  addEntry(entries, "TimeoutStopSec", config.timeoutStopSec);

  return { name: "Service", entries };
};

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
  const result: ServiceConfig = {
    restart: config.restart ?? stackDefaults.restart ?? systemDefaults.restart ?? "on-failure",
  };

  const restartSecOpt = fromUndefined(
    config.restartSec ?? stackDefaults.restartSec ?? systemDefaults.restartSec
  );
  const timeoutStartSecOpt = fromUndefined(
    config.timeoutStartSec ?? stackDefaults.timeoutStartSec ?? systemDefaults.timeoutStartSec
  );
  const timeoutStopSecOpt = fromUndefined(
    config.timeoutStopSec ?? stackDefaults.timeoutStopSec ?? systemDefaults.timeoutStopSec
  );

  if (restartSecOpt.isSome) {
    result.restartSec = restartSecOpt.value;
  }
  if (timeoutStartSecOpt.isSome) {
    result.timeoutStartSec = timeoutStartSecOpt.value;
  }
  if (timeoutStopSecOpt.isSome) {
    result.timeoutStopSec = timeoutStopSecOpt.value;
  }

  return result;
};
