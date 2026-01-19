// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * [Unit] section builder for quadlet files.
 */

import { fromUndefined, mapOption } from "../lib/option";
import type { IniSection } from "./format";
import { addEntries, addEntry } from "./format";

/**
 * Top-level regex for unit name suffix removal.
 */
const SERVICE_SUFFIX_REGEX = /\.service$/;

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
  return unitName.replace(SERVICE_SUFFIX_REGEX, "");
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
  const result: Pick<UnitConfig, "requires" | "wants" | "after" | "before"> = {};

  const reqOpt = mapOption(fromUndefined(requires), (r) => r.map(toUnitName));
  if (reqOpt.isSome) {
    result.requires = reqOpt.value;
  }

  const wantsOpt = mapOption(fromUndefined(wants), (w) => w.map(toUnitName));
  if (wantsOpt.isSome) {
    result.wants = wantsOpt.value;
  }

  const afterOpt = mapOption(fromUndefined(after), (a) => a.map(toUnitName));
  if (afterOpt.isSome) {
    result.after = afterOpt.value;
  }

  const beforeOpt = mapOption(fromUndefined(before), (b) => b.map(toUnitName));
  if (beforeOpt.isSome) {
    result.before = beforeOpt.value;
  }

  return result;
};
