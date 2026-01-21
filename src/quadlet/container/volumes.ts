// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container volume configuration for quadlet files.
 */

import { Array as Arr, Option, pipe } from "effect";
import type { Entries } from "../entry";
import { concat, fromArray, fromArrayWith } from "../entry-combinators";
import type { VolumeMount } from "../types";

export interface ContainerVolumeConfig {
  /** Volume mounts */
  readonly volumes?: readonly VolumeMount[] | undefined;
  /** Tmpfs mounts */
  readonly tmpfs?: readonly string[] | undefined;
  /** Read-only bind mounts */
  readonly readOnlyMounts?: readonly string[] | undefined;
}

/**
 * Format a volume mount for quadlet.
 */
export const formatVolumeMount = (mount: VolumeMount): string => {
  const options = mount.options ? `:${mount.options}` : "";
  return `${mount.source}:${mount.target}${options}`;
};

export const getVolumeEntries = (config: ContainerVolumeConfig): Entries =>
  concat(
    fromArrayWith("Volume", config.volumes, formatVolumeMount),
    fromArray("Tmpfs", config.tmpfs),
    fromArrayWith("Volume", config.readOnlyMounts, (mount) => `${mount}:ro`)
  );

/**
 * Create a bind mount
 */
export const createBindMount = (source: string, target: string, options?: string): VolumeMount => ({
  source,
  target,
  ...(options !== undefined && { options }),
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
 * Create a named volume mount
 */
export const createNamedVolumeMount = (
  volumeName: string,
  target: string,
  options?: string
): VolumeMount => ({
  source: `${volumeName}.volume`,
  target,
  ...(options !== undefined && { options }),
});

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
 * Check if volume options already include ownership flag (:U).
 */
const hasOwnershipFlag = (options: string | undefined): boolean => {
  if (!options) {
    return false;
  }
  const parts = options.split(",");
  return parts.some((p) => p === "U");
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
 * Add ownership flag (:U) to a bind mount.
 * The :U flag tells Podman to chown the source to the container's UID.
 *
 * Only applies to bind mounts (absolute paths), not named volumes.
 * Named volumes don't need :U because Podman manages their ownership.
 * Skips if already has :U option.
 */
export const withOwnershipFlag = (mount: VolumeMount): VolumeMount => {
  // Only apply to bind mounts
  if (!isBindMount(mount.source)) {
    return mount;
  }

  // Skip if already has ownership flag
  if (hasOwnershipFlag(mount.options)) {
    return mount;
  }

  // Append U to existing options or set it
  const newOptions = mount.options ? `${mount.options},U` : "U";

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
  volumes: readonly VolumeMount[] | undefined,
  selinuxEnforcing: boolean
): readonly VolumeMount[] | undefined => {
  if (!volumes) {
    return undefined;
  }
  return volumes.map((v) => withSELinuxRelabel(v, selinuxEnforcing));
};

/**
 * Options for processing volumes.
 */
export interface VolumeProcessingOptions {
  /** Whether SELinux is in enforcing mode */
  selinuxEnforcing: boolean;
  /** Whether to add :U ownership flag for bind mounts */
  applyOwnership: boolean;
}

/**
 * Process volumes
 */
export const processVolumes = (
  volumes: readonly VolumeMount[] | undefined,
  options: VolumeProcessingOptions
): readonly VolumeMount[] | undefined =>
  pipe(
    Option.fromNullable(volumes),
    Option.map(
      Arr.map(
        (mount: VolumeMount): VolumeMount =>
          pipe(
            mount,
            (m) => (options.selinuxEnforcing ? withSELinuxRelabel(m, true) : m),
            (m) => (options.applyOwnership ? withOwnershipFlag(m) : m)
          )
      )
    ),
    Option.getOrUndefined
  );
