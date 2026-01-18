/**
 * Hardware acceleration for machine learning inference.
 */

import type { MlBackend } from "../schema";

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
const getCudaConfig = (): MlDevices => ({
  devices: [
    "/dev/nvidia0",
    "/dev/nvidiactl",
    "/dev/nvidia-uvm",
  ],
  environment: {
    NVIDIA_VISIBLE_DEVICES: "all",
    NVIDIA_DRIVER_CAPABILITIES: "compute,utility",
  },
  imageSuffix: "-cuda",
});

/**
 * Get configuration for Intel OpenVINO ML acceleration.
 */
const getOpenVinoConfig = (): MlDevices => ({
  devices: ["/dev/dri/renderD128"],
  environment: {},
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
const getRocmConfig = (): MlDevices => ({
  devices: [
    "/dev/kfd",
    "/dev/dri/renderD128",
  ],
  environment: {
    HSA_OVERRIDE_GFX_VERSION: "10.3.0",
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
 * Get ML device configuration for a backend.
 */
export const getMlDevices = (backend: MlBackend): MlDevices => {
  switch (backend) {
    case "cuda":
      return getCudaConfig();
    case "openvino":
      return getOpenVinoConfig();
    case "armnn":
      return getArmnnConfig();
    case "rknn":
      return getRknnConfig();
    case "rocm":
      return getRocmConfig();
    case "disabled":
      return getCpuConfig();
  }
};

/**
 * Get the full ML container image with suffix.
 */
export const getMlImage = (baseImage: string, backend: MlBackend): string => {
  const config = getMlDevices(backend);
  if (!config.imageSuffix) {
    return baseImage;
  }

  // Insert suffix before tag
  // e.g., ghcr.io/immich-app/immich-machine-learning:release
  // becomes ghcr.io/immich-app/immich-machine-learning:release-cuda
  const colonIndex = baseImage.lastIndexOf(":");
  if (colonIndex === -1) {
    return `${baseImage}${config.imageSuffix}`;
  }

  const imagePart = baseImage.slice(0, colonIndex);
  const tagPart = baseImage.slice(colonIndex + 1);
  return `${imagePart}:${tagPart}${config.imageSuffix}`;
};

/**
 * Check if ML backend requires special devices.
 */
export const mlRequiresDevices = (backend: MlBackend): boolean => {
  const config = getMlDevices(backend);
  return config.devices.length > 0;
};
