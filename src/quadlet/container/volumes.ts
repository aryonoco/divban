// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container volume configuration for quadlet files.
 */

import { addEntries } from "../format";
import type { VolumeMount } from "../types";

export interface ContainerVolumeConfig {
  /** Volume mounts */
  volumes?: VolumeMount[] | undefined;
  /** Tmpfs mounts */
  tmpfs?: string[] | undefined;
  /** Read-only bind mounts */
  readOnlyMounts?: string[] | undefined;
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
export const createBindMount = (source: string, target: string, options?: string): VolumeMount => {
  const result: VolumeMount = { source, target };
  if (options !== undefined) {
    result.options = options;
  }
  return result;
};

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
): VolumeMount => {
  const result: VolumeMount = { source: `${volumeName}.volume`, target };
  if (options !== undefined) {
    result.options = options;
  }
  return result;
};

/**
 * Create a mount with SELinux relabeling.
 */
export const createRelabeledMount = (
  source: string,
  target: string,
  shared = false
): VolumeMount => ({
  source,
  target,
  options: shared ? "z" : "Z",
});

/**
 * Common mount paths.
 */
export const CommonMounts: Record<string, VolumeMount> = {
  /** /etc/localtime for timezone */
  LOCALTIME: createReadOnlyMount("/etc/localtime", "/etc/localtime"),
  /** /etc/timezone for timezone (Debian-based) */
  TIMEZONE: createReadOnlyMount("/etc/timezone", "/etc/timezone"),
} as const satisfies Record<string, VolumeMount>;

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

/**
 * Check if volume options already include SELinux relabeling (:z or :Z).
 */
const hasRelabelOption = (options: string | undefined): boolean => {
  if (!options) {
    return false;
  }
  const parts = options.split(",");
  return parts.some((p) => p === "z" || p === "Z");
};

/**
 * Add SELinux relabel option to a single volume mount if needed.
 * Only applies to bind mounts (absolute paths), not named volumes.
 * Skips if already has :z or :Z option.
 */
export const withSELinuxRelabel = (mount: VolumeMount, selinuxEnforcing: boolean): VolumeMount => {
  // Only relabel if SELinux is enforcing
  if (!selinuxEnforcing) {
    return mount;
  }

  // Only relabel bind mounts (absolute paths), not named volumes
  if (!isBindMount(mount.source)) {
    return mount;
  }

  // Skip if already has relabel option
  if (hasRelabelOption(mount.options)) {
    return mount;
  }

  // Append Z to existing options or set it
  const newOptions = mount.options ? `${mount.options},Z` : "Z";

  return {
    ...mount,
    options: newOptions,
  };
};

/**
 * Apply SELinux relabeling to all volumes in an array.
 * Returns undefined if input is undefined (preserves optionality).
 */
export const relabelVolumes = (
  volumes: VolumeMount[] | undefined,
  selinuxEnforcing: boolean
): VolumeMount[] | undefined => {
  if (!volumes) {
    return undefined;
  }
  return volumes.map((v) => withSELinuxRelabel(v, selinuxEnforcing));
};
