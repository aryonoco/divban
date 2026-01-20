// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Hardware acceleration device mappings for transcoding.
 */

import { Option } from "effect";
import { mapOr } from "../../../lib/option-helpers";
import { assertNever } from "../../../lib/types";
import type { TranscodingConfig } from "../schema";

/**
 * Device mapping for hardware transcoding.
 */
export interface TranscodingDevices {
  /** Device paths to mount */
  devices: string[];
  /** Environment variables to set */
  environment: Record<string, string>;
  /** Additional volume mounts */
  volumes?: Array<{ source: string; target: string; options?: string }>;
}

/**
 * Get device mappings for NVIDIA NVENC transcoding.
 */
const getNvencDevices = (gpuIndex?: number): TranscodingDevices => ({
  devices: mapOr(
    Option.fromNullable(gpuIndex),
    ["/dev/nvidia0", "/dev/nvidiactl", "/dev/nvidia-uvm", "/dev/nvidia-uvm-tools"],
    (idx) => [`/dev/nvidia${idx}`, "/dev/nvidiactl", "/dev/nvidia-uvm", "/dev/nvidia-uvm-tools"]
  ),
  environment: {
    NVIDIA_VISIBLE_DEVICES: mapOr(Option.fromNullable(gpuIndex), "all", String),
    NVIDIA_DRIVER_CAPABILITIES: "compute,video,utility",
  },
});

/**
 * Get device mappings for Intel Quick Sync Video.
 */
const getQsvDevices = (renderDevice?: string): TranscodingDevices => ({
  devices: [renderDevice ?? "/dev/dri/renderD128"],
  environment: {},
});

/**
 * Get device mappings for VA-API (Intel/AMD).
 */
const getVaapiDevices = (renderDevice?: string): TranscodingDevices => ({
  devices: [renderDevice ?? "/dev/dri/renderD128"],
  environment: {},
});

/**
 * Get device mappings for VA-API in WSL.
 */
const getVaapiWslDevices = (): TranscodingDevices => ({
  devices: ["/dev/dri/card0", "/dev/dri/renderD128"],
  environment: {},
  volumes: [{ source: "/usr/lib/wsl", target: "/usr/lib/wsl", options: "ro" }],
});

/**
 * Get device mappings for Rockchip MPP.
 */
const getRkmppDevices = (): TranscodingDevices => ({
  devices: ["/dev/dri", "/dev/dma_heap", "/dev/mali0", "/dev/rga", "/dev/mpp_service"],
  environment: {},
});

/**
 * Get device mappings for a transcoding configuration.
 */
export const getTranscodingDevices = (
  config: TranscodingConfig
): Option.Option<TranscodingDevices> => {
  switch (config.type) {
    case "nvenc":
      return Option.some(getNvencDevices(config.gpuIndex));
    case "qsv":
      return Option.some(getQsvDevices(config.renderDevice));
    case "vaapi":
      return Option.some(getVaapiDevices(config.renderDevice));
    case "vaapi-wsl":
      return Option.some(getVaapiWslDevices());
    case "rkmpp":
      return Option.some(getRkmppDevices());
    case "disabled":
      return Option.none();
    default:
      return assertNever(config);
  }
};

/**
 * Check if a transcoding configuration requires special devices.
 */
export const requiresDevices = (config: TranscodingConfig): boolean => config.type !== "disabled";
