/**
 * Hardware acceleration device mappings for transcoding.
 */

import type { TranscodingBackend } from "../schema";

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
const getNvencDevices = (): TranscodingDevices => ({
  devices: [
    "/dev/nvidia0",
    "/dev/nvidiactl",
    "/dev/nvidia-uvm",
    "/dev/nvidia-uvm-tools",
  ],
  environment: {
    NVIDIA_VISIBLE_DEVICES: "all",
    NVIDIA_DRIVER_CAPABILITIES: "compute,video,utility",
  },
});

/**
 * Get device mappings for Intel Quick Sync Video.
 */
const getQsvDevices = (): TranscodingDevices => ({
  devices: ["/dev/dri/renderD128"],
  environment: {},
});

/**
 * Get device mappings for VA-API (Intel/AMD).
 */
const getVaapiDevices = (): TranscodingDevices => ({
  devices: ["/dev/dri/renderD128"],
  environment: {},
});

/**
 * Get device mappings for VA-API in WSL.
 */
const getVaapiWslDevices = (): TranscodingDevices => ({
  devices: ["/dev/dri/card0", "/dev/dri/renderD128"],
  environment: {},
  volumes: [
    { source: "/usr/lib/wsl", target: "/usr/lib/wsl", options: "ro" },
  ],
});

/**
 * Get device mappings for Rockchip MPP.
 */
const getRkmppDevices = (): TranscodingDevices => ({
  devices: [
    "/dev/dri",
    "/dev/dma_heap",
    "/dev/mali0",
    "/dev/rga",
    "/dev/mpp_service",
  ],
  environment: {},
});

/**
 * Get device mappings for a transcoding backend.
 */
export const getTranscodingDevices = (backend: TranscodingBackend): TranscodingDevices | null => {
  switch (backend) {
    case "nvenc":
      return getNvencDevices();
    case "qsv":
      return getQsvDevices();
    case "vaapi":
      return getVaapiDevices();
    case "vaapi-wsl":
      return getVaapiWslDevices();
    case "rkmpp":
      return getRkmppDevices();
    case "disabled":
      return null;
  }
};

/**
 * Check if a transcoding backend requires special devices.
 */
export const requiresDevices = (backend: TranscodingBackend): boolean => {
  return backend !== "disabled";
};
