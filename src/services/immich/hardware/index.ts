// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Hardware acceleration module exports.
 */

export {
  getTranscodingDevices,
  requiresDevices,
} from "./transcoding";
export type { TranscodingDevices } from "./transcoding";

export {
  getMlDevices,
  getMlImage,
  mlRequiresDevices,
} from "./ml";
export type { MlDevices } from "./ml";

import type { MlBackend, TranscodingBackend } from "../schema";
import { type MlDevices, getMlDevices } from "./ml";
import { type TranscodingDevices, getTranscodingDevices } from "./transcoding";

/**
 * Combined hardware configuration.
 */
export interface HardwareConfig {
  transcoding: TranscodingDevices | null;
  ml: MlDevices;
}

/**
 * Get combined hardware configuration.
 */
export const getHardwareConfig = (
  transcodingBackend: TranscodingBackend,
  mlBackend: MlBackend
): HardwareConfig => ({
  transcoding: getTranscodingDevices(transcodingBackend),
  ml: getMlDevices(mlBackend),
});

/**
 * Merge devices from multiple sources.
 */
export const mergeDevices = (...sources: (TranscodingDevices | MlDevices | null)[]): string[] => {
  const devices = new Set<string>();

  for (const source of sources) {
    if (source) {
      for (const device of source.devices) {
        devices.add(device);
      }
    }
  }

  return [...devices];
};

/**
 * Merge environment variables from multiple sources.
 */
export const mergeEnvironment = (
  ...sources: (TranscodingDevices | MlDevices | null)[]
): Record<string, string> => {
  const env: Record<string, string> = {};

  for (const source of sources) {
    if (source) {
      Object.assign(env, source.environment);
    }
  }

  return env;
};
