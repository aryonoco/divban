// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Hardware detection for GPU-accelerated processing. Immich benefits
 * significantly from hardware acceleration - transcoding drops from
 * hours to minutes, ML inference becomes real-time. This module maps
 * config (nvenc, qsv, vaapi, cuda, openvino) to container devices
 * and environment variables.
 */

export { getTranscodingDevices, requiresDevices } from "./transcoding";
export type { TranscodingDevices } from "./transcoding";

export { getMlDevices, getMlImage, mlRequiresDevices } from "./ml";
export type { MlDevices } from "./ml";

import { Match, Option, pipe } from "effect";
import { concatUnique, foldRecords } from "../../../lib/collection-utils";
import type { MlConfig, TranscodingConfig } from "../schema";
import { type MlDevices, getMlDevices } from "./ml";
import { type TranscodingDevices, getTranscodingDevices } from "./transcoding";

export interface HardwareConfig {
  readonly transcoding: Option.Option<TranscodingDevices>;
  readonly ml: MlDevices;
}

export const getHardwareConfig = (
  transcoding: TranscodingConfig,
  ml: MlConfig
): HardwareConfig => ({
  transcoding: getTranscodingDevices(transcoding),
  ml: getMlDevices(ml),
});

/**
 * Unifies direct device configs with Option-wrapped configs so merge
 * functions can accept both MlDevices and Option<TranscodingDevices>.
 */
type DeviceSource =
  | { readonly kind: "direct"; readonly value: TranscodingDevices | MlDevices }
  | { readonly kind: "optional"; readonly value: Option.Option<TranscodingDevices> };

const DeviceSource = {
  direct: (value: TranscodingDevices | MlDevices): DeviceSource => ({ kind: "direct", value }),
  optional: (value: Option.Option<TranscodingDevices>): DeviceSource => ({
    kind: "optional",
    value,
  }),
} as const;

const extractDevices = (source: DeviceSource): readonly string[] =>
  pipe(
    Match.value(source),
    Match.when({ kind: "direct" }, (s): readonly string[] => s.value.devices),
    Match.when({ kind: "optional" }, (s): readonly string[] =>
      pipe(
        s.value,
        Option.match({
          onNone: (): readonly string[] => [],
          onSome: (v): readonly string[] => v.devices,
        })
      )
    ),
    Match.exhaustive
  );

const extractEnvironment = (source: DeviceSource): Readonly<Record<string, string>> =>
  pipe(
    Match.value(source),
    Match.when({ kind: "direct" }, (s): Readonly<Record<string, string>> => s.value.environment),
    Match.when(
      { kind: "optional" },
      (s): Readonly<Record<string, string>> =>
        pipe(
          s.value,
          Option.match({
            onNone: (): Readonly<Record<string, string>> => ({}),
            onSome: (v): Readonly<Record<string, string>> => v.environment,
          })
        )
    ),
    Match.exhaustive
  );

const wrapSource = (
  source: TranscodingDevices | MlDevices | Option.Option<TranscodingDevices>
): DeviceSource =>
  Option.isOption(source) ? DeviceSource.optional(source) : DeviceSource.direct(source);

export const mergeDevices = (
  ...sources: readonly (TranscodingDevices | MlDevices | Option.Option<TranscodingDevices>)[]
): readonly string[] => concatUnique(...sources.map(wrapSource).map(extractDevices));

export const mergeEnvironment = (
  ...sources: readonly (TranscodingDevices | MlDevices | Option.Option<TranscodingDevices>)[]
): Readonly<Record<string, string>> =>
  foldRecords({}, sources.map(wrapSource).map(extractEnvironment));
