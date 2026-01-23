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
import { type ContainerImage, containerImage } from "../../../lib/types";
import type { MlConfig } from "../schema";

export interface MlDevices {
  devices: string[];
  environment: Record<string, string>;
  volumes?: Array<{ source: string; target: string; options?: string }>;
  imageSuffix: string;
}

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

const getOpenVinoConfig = (device?: "CPU" | "GPU" | "AUTO"): MlDevices => ({
  devices: device === "GPU" ? ["/dev/dri/renderD128"] : [],
  environment: device ? { OPENVINO_DEVICE: device } : {},
  imageSuffix: "-openvino",
});

const getArmnnConfig = (): MlDevices => ({
  devices: [],
  environment: {},
  imageSuffix: "-armnn",
});

const getRknnConfig = (): MlDevices => ({
  devices: ["/dev/dri", "/dev/mali0"],
  environment: {},
  imageSuffix: "-rknn",
});

const getRocmConfig = (gfxVersion?: string): MlDevices => ({
  devices: ["/dev/kfd", "/dev/dri/renderD128"],
  environment: {
    HSA_OVERRIDE_GFX_VERSION: gfxVersion ?? "10.3.0",
  },
  imageSuffix: "-rocm",
});

const getCpuConfig = (): MlDevices => ({
  devices: [],
  environment: {},
  imageSuffix: "",
});

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

/** Inserts suffix before tag: `image:release` → `image:release-cuda` */
const insertSuffix = (baseImage: string, suffix: string): string => {
  const colonIndex = baseImage.lastIndexOf(":");
  return colonIndex === -1
    ? `${baseImage}${suffix}`
    : `${baseImage.slice(0, colonIndex)}:${baseImage.slice(colonIndex + 1)}${suffix}`;
};

export const getMlImage = (baseImage: ContainerImage, config: MlConfig): ContainerImage =>
  pipe(getMlDevices(config).imageSuffix, (suffix) =>
    suffix ? containerImage(insertSuffix(baseImage as string, suffix)) : baseImage
  );

export const mlRequiresDevices = (config: MlConfig): boolean =>
  config.type !== "disabled" && getMlDevices(config).devices.length > 0;
