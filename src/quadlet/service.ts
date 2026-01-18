/**
 * [Service] section builder for quadlet files.
 */

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
 */
export const mergeServiceConfig = (
  config: Partial<ServiceConfig>,
  defaults: ServiceConfig = defaultServiceConfig()
): ServiceConfig => ({
  restart: config.restart ?? defaults.restart,
  restartSec: config.restartSec ?? defaults.restartSec,
  timeoutStartSec: config.timeoutStartSec ?? defaults.timeoutStartSec,
  timeoutStopSec: config.timeoutStopSec ?? defaults.timeoutStopSec,
});
