/**
 * Container volume configuration for quadlet files.
 */

import { addEntries, addEntry } from "../format";
import type { VolumeMount } from "../types";

export interface ContainerVolumeConfig {
  /** Volume mounts */
  volumes?: VolumeMount[];
  /** Tmpfs mounts */
  tmpfs?: string[];
  /** Read-only bind mounts */
  readOnlyMounts?: string[];
}

/**
 * Format a volume mount for quadlet.
 */
export const formatVolumeMount = (mount: VolumeMount): string => {
  const options = mount.options ? `:${mount.options}` : "";
  return `${mount.source}:${mount.target}${options}`;
};

/**
 * Add volume-related entries to a section.
 */
export const addVolumeEntries = (
  entries: Array<{ key: string; value: string }>,
  config: ContainerVolumeConfig
): void => {
  // Volume mounts
  if (config.volumes) {
    for (const mount of config.volumes) {
      entries.push({ key: "Volume", value: formatVolumeMount(mount) });
    }
  }

  // Tmpfs mounts
  addEntries(entries, "Tmpfs", config.tmpfs);

  // Read-only mounts (convenience)
  if (config.readOnlyMounts) {
    for (const mount of config.readOnlyMounts) {
      entries.push({ key: "Volume", value: `${mount}:ro` });
    }
  }
};

/**
 * Create a bind mount.
 */
export const createBindMount = (
  source: string,
  target: string,
  options?: string
): VolumeMount => ({
  source,
  target,
  options,
});

/**
 * Create a read-only bind mount.
 */
export const createReadOnlyMount = (source: string, target: string): VolumeMount => ({
  source,
  target,
  options: "ro",
});

/**
 * Create a named volume mount.
 */
export const createNamedVolumeMount = (
  volumeName: string,
  target: string,
  options?: string
): VolumeMount => ({
  source: `${volumeName}.volume`,
  target,
  options,
});

/**
 * Create a mount with SELinux relabeling.
 */
export const createRelabeledMount = (
  source: string,
  target: string,
  shared: boolean = false
): VolumeMount => ({
  source,
  target,
  options: shared ? "z" : "Z",
});

/**
 * Common mount paths.
 */
export const CommonMounts = {
  /** /etc/localtime for timezone */
  LOCALTIME: createReadOnlyMount("/etc/localtime", "/etc/localtime"),
  /** /etc/timezone for timezone (Debian-based) */
  TIMEZONE: createReadOnlyMount("/etc/timezone", "/etc/timezone"),
} as const;

/**
 * Check if a source is a named volume (ends with .volume).
 */
export const isNamedVolume = (source: string): boolean => {
  return source.endsWith(".volume");
};

/**
 * Check if a source is an absolute path (bind mount).
 */
export const isBindMount = (source: string): boolean => {
  return source.startsWith("/");
};
