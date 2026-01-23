// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Systemd [Unit] section for service dependencies and ordering.
 * After/Before control startup sequence without hard dependencies.
 * Requires vs Wants determines failure propagation - use Wants for
 * optional services that shouldn't take down dependents on failure.
 * Container names automatically get .service suffix for systemd.
 */

import { Array as Arr, Option, pipe } from "effect";
import { stripSuffix } from "../lib/str-transform";
import type { Entries } from "./entry";
import { concat, fromArray, fromValue } from "./entry-combinators";
import type { IniSection } from "./format";
import { makeSection } from "./section-factory";

export interface UnitConfig {
  /** Human-readable description */
  readonly description: string;
  /** Hard dependencies - unit fails if these fail */
  readonly requires?: readonly string[] | undefined;
  /** Soft dependencies - unit doesn't fail if these fail */
  readonly wants?: readonly string[] | undefined;
  /** Order: start after these units */
  readonly after?: readonly string[] | undefined;
  /** Order: start before these units */
  readonly before?: readonly string[] | undefined;
  /** Start limit configuration */
  readonly startLimitIntervalSec?: number | undefined;
  readonly startLimitBurst?: number | undefined;
}

/**
 * Helper: create optional field from Option.
 * Stays in Option until the final extraction.
 */
const optionalField = <K extends string, V>(
  key: K,
  opt: Option.Option<V>
): { readonly [P in K]?: V } =>
  pipe(
    opt,
    Option.match({
      onNone: (): { readonly [P in K]?: V } => ({}) as { readonly [P in K]?: V },
      onSome: (v): { readonly [P in K]?: V } => ({ [key]: v }) as { readonly [P in K]?: V },
    })
  );

export const getUnitSectionEntries = (config: UnitConfig): Entries =>
  concat(
    fromValue("Description", config.description),
    fromArray("Requires", config.requires),
    fromArray("Wants", config.wants),
    fromArray("After", config.after),
    fromArray("Before", config.before),
    fromValue("StartLimitIntervalSec", config.startLimitIntervalSec),
    fromValue("StartLimitBurst", config.startLimitBurst)
  );

/**
 * Build the [Unit] section for a quadlet file.
 */
export const buildUnitSection: (config: UnitConfig) => IniSection = makeSection(
  "Unit",
  getUnitSectionEntries
);

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
export const fromUnitName = (unitName: string): string => pipe(unitName, stripSuffix(".service"));

/**
 * Build unit dependencies from container names.
 */
export const buildUnitDependencies = (
  requires?: readonly string[],
  wants?: readonly string[],
  after?: readonly string[],
  before?: readonly string[]
): Pick<UnitConfig, "requires" | "wants" | "after" | "before"> => {
  // Compute each mapping exactly once
  const mapped = {
    requires: pipe(Option.fromNullable(requires), Option.map(Arr.map(toUnitName))),
    wants: pipe(Option.fromNullable(wants), Option.map(Arr.map(toUnitName))),
    after: pipe(Option.fromNullable(after), Option.map(Arr.map(toUnitName))),
    before: pipe(Option.fromNullable(before), Option.map(Arr.map(toUnitName))),
  };

  // Extract at the boundary
  return {
    ...optionalField("requires", mapped.requires),
    ...optionalField("wants", mapped.wants),
    ...optionalField("after", mapped.after),
    ...optionalField("before", mapped.before),
  };
};
