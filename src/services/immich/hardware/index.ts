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
import { getMlDevices, type MlDevices } from "./ml";
import { getTranscodingDevices, type TranscodingDevices } from "./transcoding";

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
export const mergeDevices = (
  ...sources: (TranscodingDevices | MlDevices | null)[]
): string[] => {
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
