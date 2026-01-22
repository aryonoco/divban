// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Hardware acceleration module exports.
 */

export { getTranscodingDevices, requiresDevices } from "./transcoding";
export type { TranscodingDevices } from "./transcoding";

export { getMlDevices, getMlImage, mlRequiresDevices } from "./ml";
export type { MlDevices } from "./ml";

import { Option, pipe } from "effect";
import { concatUnique, foldRecords } from "../../../lib/collection-utils";
import type { MlConfig, TranscodingConfig } from "../schema";
import { type MlDevices, getMlDevices } from "./ml";
import { type TranscodingDevices, getTranscodingDevices } from "./transcoding";

/**
 * Combined hardware configuration.
 */
export interface HardwareConfig {
  readonly transcoding: Option.Option<TranscodingDevices>;
  readonly ml: MlDevices;
}

/**
 * Get combined hardware configuration.
 */
export const getHardwareConfig = (
  transcoding: TranscodingConfig,
  ml: MlConfig
): HardwareConfig => ({
  transcoding: getTranscodingDevices(transcoding),
  ml: getMlDevices(ml),
});

// ============================================================================
// Type-safe source handling
// ============================================================================

/**
 * Discriminated union for device sources.
 */
type DeviceSource =
  | { readonly kind: "direct"; readonly value: TranscodingDevices | MlDevices }
  | { readonly kind: "optional"; readonly value: Option.Option<TranscodingDevices> };

/**
 * Smart constructors for DeviceSource.
 * Prefer these over raw object literals.
 */
const DeviceSource = {
  direct: (value: TranscodingDevices | MlDevices): DeviceSource => ({ kind: "direct", value }),
  optional: (value: Option.Option<TranscodingDevices>): DeviceSource => ({
    kind: "optional",
    value,
  }),
} as const;

/**
 * Extract devices from a source using pattern matching.
 * Total function - handles all cases.
 */
const extractDevices = (source: DeviceSource): readonly string[] => {
  switch (source.kind) {
    case "direct":
      return source.value.devices;
    case "optional":
      return pipe(
        source.value,
        Option.match({
          onNone: (): readonly string[] => [],
          onSome: (v): readonly string[] => v.devices,
        })
      );
    default: {
      // Exhaustiveness check: this should never be reached
      const exhaustiveCheck: never = source;
      return exhaustiveCheck;
    }
  }
};

/**
 * Extract environment from a source using pattern matching.
 */
const extractEnvironment = (source: DeviceSource): Readonly<Record<string, string>> => {
  switch (source.kind) {
    case "direct":
      return source.value.environment;
    case "optional":
      return pipe(
        source.value,
        Option.match({
          onNone: (): Readonly<Record<string, string>> => ({}),
          onSome: (v): Readonly<Record<string, string>> => v.environment,
        })
      );
    default: {
      // Exhaustiveness check: this should never be reached
      const exhaustiveCheck: never = source;
      return exhaustiveCheck;
    }
  }
};

/**
 * Wrap a raw source in DeviceSource.
 */
const wrapSource = (
  source: TranscodingDevices | MlDevices | Option.Option<TranscodingDevices>
): DeviceSource =>
  Option.isOption(source) ? DeviceSource.optional(source) : DeviceSource.direct(source);

/**
 * Merge devices from multiple sources.
 */
export const mergeDevices = (
  ...sources: readonly (TranscodingDevices | MlDevices | Option.Option<TranscodingDevices>)[]
): readonly string[] => concatUnique(...sources.map(wrapSource).map(extractDevices));

/**
 * Merge environment variables from multiple sources.
 */
export const mergeEnvironment = (
  ...sources: readonly (TranscodingDevices | MlDevices | Option.Option<TranscodingDevices>)[]
): Readonly<Record<string, string>> =>
  foldRecords({}, sources.map(wrapSource).map(extractEnvironment));
