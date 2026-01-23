// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * ML inference acceleration for face recognition and smart search.
 * Without GPU, processing a large library takes days. CUDA (NVIDIA)
 * and OpenVINO (Intel) provide order-of-magnitude speedups. Each
 * backend requires specific device mounts and environment setup.
 */

import { Match, Option, pipe } from "effect";
import { mapOr } from "../../../lib/option-helpers";
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
    Option.fromNullable(gpuIndex),
    ["/dev/nvidia0", "/dev/nvidiactl", "/dev/nvidia-uvm"],
    (idx) => [`/dev/nvidia${idx}`, "/dev/nvidiactl", "/dev/nvidia-uvm"]
  ),
  environment: {
    NVIDIA_VISIBLE_DEVICES: mapOr(Option.fromNullable(gpuIndex), "all", String),
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
export const getMlDevices = (config: MlConfig): MlDevices =>
  pipe(
    Match.value(config),
    Match.when({ type: "cuda" }, (c) => getCudaConfig(c.gpuIndex)),
    Match.when({ type: "openvino" }, (c) => getOpenVinoConfig(c.device)),
    Match.when({ type: "armnn" }, () => getArmnnConfig()),
    Match.when({ type: "rknn" }, () => getRknnConfig()),
    Match.when({ type: "rocm" }, (c) => getRocmConfig(c.gfxVersion)),
    Match.when({ type: "disabled" }, () => getCpuConfig()),
    Match.exhaustive
  );

/**
 * Insert suffix before tag in an image reference.
 * e.g., ghcr.io/immich-app/immich-machine-learning:release
 * becomes ghcr.io/immich-app/immich-machine-learning:release-cuda
 */
const insertSuffix = (baseImage: string, suffix: string): string => {
  const colonIndex = baseImage.lastIndexOf(":");
  return colonIndex === -1
    ? `${baseImage}${suffix}`
    : `${baseImage.slice(0, colonIndex)}:${baseImage.slice(colonIndex + 1)}${suffix}`;
};

/**
 * Get the full ML container image with suffix.
 */
export const getMlImage = (baseImage: string, config: MlConfig): string =>
  pipe(getMlDevices(config).imageSuffix, (suffix) =>
    suffix ? insertSuffix(baseImage, suffix) : baseImage
  );

/**
 * Check if ML config requires special devices.
 */
export const mlRequiresDevices = (config: MlConfig): boolean =>
  config.type !== "disabled" && getMlDevices(config).devices.length > 0;
