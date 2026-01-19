// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Hardware acceleration for machine learning inference.
 */

import { fromUndefined, mapOr } from "../../../lib/option";
import { assertNever } from "../../../lib/types";
import type { MlConfig } from "../schema";

/**
 * ML hardware configuration.
 */
export interface MlDevices {
  /** Device paths to mount */
  devices: string[];
  /** Environment variables to set */
  environment: Record<string, string>;
  /** Additional volume mounts */
  volumes?: Array<{ source: string; target: string; options?: string }>;
  /** Image suffix for the ML container */
  imageSuffix: string;
}

/**
 * Get configuration for NVIDIA CUDA ML acceleration.
 */
const getCudaConfig = (gpuIndex?: number): MlDevices => ({
  devices: mapOr(
    fromUndefined(gpuIndex),
    ["/dev/nvidia0", "/dev/nvidiactl", "/dev/nvidia-uvm"],
    (idx) => [`/dev/nvidia${idx}`, "/dev/nvidiactl", "/dev/nvidia-uvm"]
  ),
  environment: {
    NVIDIA_VISIBLE_DEVICES: mapOr(fromUndefined(gpuIndex), "all", String),
    NVIDIA_DRIVER_CAPABILITIES: "compute,utility",
  },
  imageSuffix: "-cuda",
});

/**
 * Get configuration for Intel OpenVINO ML acceleration.
 */
const getOpenVinoConfig = (device?: "CPU" | "GPU" | "AUTO"): MlDevices => ({
  devices: device === "GPU" ? ["/dev/dri/renderD128"] : [],
  environment: device ? { OPENVINO_DEVICE: device } : {},
  imageSuffix: "-openvino",
});

/**
 * Get configuration for ARM NN ML acceleration.
 */
const getArmnnConfig = (): MlDevices => ({
  devices: [],
  environment: {},
  imageSuffix: "-armnn",
});

/**
 * Get configuration for Rockchip NPU ML acceleration.
 */
const getRknnConfig = (): MlDevices => ({
  devices: ["/dev/dri", "/dev/mali0"],
  environment: {},
  imageSuffix: "-rknn",
});

/**
 * Get configuration for AMD ROCm ML acceleration.
 */
const getRocmConfig = (gfxVersion?: string): MlDevices => ({
  devices: ["/dev/kfd", "/dev/dri/renderD128"],
  environment: {
    HSA_OVERRIDE_GFX_VERSION: gfxVersion ?? "10.3.0",
  },
  imageSuffix: "-rocm",
});

/**
 * Get configuration for CPU-only ML (no acceleration).
 */
const getCpuConfig = (): MlDevices => ({
  devices: [],
  environment: {},
  imageSuffix: "",
});

/**
 * Get ML device configuration for a config.
 */
export const getMlDevices = (config: MlConfig): MlDevices => {
  switch (config.type) {
    case "cuda":
      return getCudaConfig(config.gpuIndex);
    case "openvino":
      return getOpenVinoConfig(config.device);
    case "armnn":
      return getArmnnConfig();
    case "rknn":
      return getRknnConfig();
    case "rocm":
      return getRocmConfig(config.gfxVersion);
    case "disabled":
      return getCpuConfig();
    default:
      return assertNever(config);
  }
};

/**
 * Get the full ML container image with suffix.
 */
export const getMlImage = (baseImage: string, config: MlConfig): string => {
  const devices = getMlDevices(config);
  if (!devices.imageSuffix) {
    return baseImage;
  }

  // Insert suffix before tag
  // e.g., ghcr.io/immich-app/immich-machine-learning:release
  // becomes ghcr.io/immich-app/immich-machine-learning:release-cuda
  const colonIndex = baseImage.lastIndexOf(":");
  if (colonIndex === -1) {
    return `${baseImage}${devices.imageSuffix}`;
  }

  const imagePart = baseImage.slice(0, colonIndex);
  const tagPart = baseImage.slice(colonIndex + 1);
  return `${imagePart}:${tagPart}${devices.imageSuffix}`;
};

/**
 * Check if ML config requires special devices.
 */
export const mlRequiresDevices = (config: MlConfig): boolean =>
  config.type !== "disabled" && getMlDevices(config).devices.length > 0;
