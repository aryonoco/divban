/**
 * [Unit] section builder for quadlet files.
 */

import type { IniSection } from "./format";
import { addEntries, addEntry } from "./format";

export interface UnitConfig {
  /** Human-readable description */
  description: string;
  /** Hard dependencies - unit fails if these fail */
  requires?: string[];
  /** Soft dependencies - unit doesn't fail if these fail */
  wants?: string[];
  /** Order: start after these units */
  after?: string[];
  /** Order: start before these units */
  before?: string[];
  /** Start limit configuration */
  startLimitIntervalSec?: number;
  startLimitBurst?: number;
}

/**
 * Build the [Unit] section for a quadlet file.
 */
export const buildUnitSection = (config: UnitConfig): IniSection => {
  const entries: Array<{ key: string; value: string }> = [];

  addEntry(entries, "Description", config.description);

  // Dependencies
  addEntries(entries, "Requires", config.requires);
  addEntries(entries, "Wants", config.wants);
  addEntries(entries, "After", config.after);
  addEntries(entries, "Before", config.before);

  // Start limits
  addEntry(entries, "StartLimitIntervalSec", config.startLimitIntervalSec);
  addEntry(entries, "StartLimitBurst", config.startLimitBurst);

  return { name: "Unit", entries };
};

/**
 * Convert container names to systemd unit names.
 * Quadlet containers become <name>.service units.
 */
export const toUnitName = (containerName: string): string => {
  return `${containerName}.service`;
};

/**
 * Convert unit names back to container names.
 */
export const fromUnitName = (unitName: string): string => {
  return unitName.replace(/\.service$/, "");
};

/**
 * Build unit dependencies from container names.
 */
export const buildUnitDependencies = (
  requires?: string[],
  wants?: string[],
  after?: string[],
  before?: string[]
): Pick<UnitConfig, "requires" | "wants" | "after" | "before"> => {
  return {
    requires: requires?.map(toUnitName),
    wants: wants?.map(toUnitName),
    after: after?.map(toUnitName),
    before: before?.map(toUnitName),
  };
};
