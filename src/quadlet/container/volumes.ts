// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container volume mounts with SELinux and ownership handling.
 * Bind mounts need :Z for SELinux relabeling (private to container)
 * and :U for ownership chown (container UID may differ from host).
 * Named volumes (.volume suffix) don't need these - Podman manages
 * them internally. The processVolumes pipeline applies both flags
 * conditionally based on mount type and host configuration.
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

export const createBindMount = (source: string, target: string, options?: string): VolumeMount => ({
  source,
  target,
  ...(options !== undefined && { options }),
});

export const createReadOnlyMount = (source: string, target: string): VolumeMount => ({
  source,
  target,
  options: "ro",
});

export const createNamedVolumeMount = (
  volumeName: string,
  target: string,
  options?: string
): VolumeMount => ({
  source: `${volumeName}.volume`,
  target,
  ...(options !== undefined && { options }),
});

export const createRelabeledMount = (
  source: string,
  target: string,
  shared = false
): VolumeMount => ({
  source,
  target,
  options: shared ? "z" : "Z",
});

export const CommonMounts: Record<string, VolumeMount> = {
  LOCALTIME: createReadOnlyMount("/etc/localtime", "/etc/localtime"),
  TIMEZONE: createReadOnlyMount("/etc/timezone", "/etc/timezone"),
} as const satisfies Record<string, VolumeMount>;

export const isNamedVolume = (source: string): boolean => {
  return source.endsWith(".volume");
};

export const isBindMount = (source: string): boolean => {
  return source.startsWith("/");
};

const hasRelabelOption = (options: string | undefined): boolean =>
  pipe(
    Option.fromNullable(options),
    Option.map((o) => o.split(",").some((p) => p === "z" || p === "Z")),
    Option.getOrElse(() => false)
  );

const hasOwnershipFlag = (options: string | undefined): boolean =>
  pipe(
    Option.fromNullable(options),
    Option.map((o) => o.split(",").some((p) => p === "U")),
    Option.getOrElse(() => false)
  );

/** Only bind mounts need relabeling; named volumes are managed by Podman. */
const shouldApplyRelabel = (mount: VolumeMount, selinuxEnforcing: boolean): boolean =>
  selinuxEnforcing && isBindMount(mount.source) && !hasRelabelOption(mount.options);

export const withSELinuxRelabel = (mount: VolumeMount, selinuxEnforcing: boolean): VolumeMount =>
  shouldApplyRelabel(mount, selinuxEnforcing)
    ? { ...mount, options: mount.options ? `${mount.options},Z` : "Z" }
    : mount;

/**
 * The :U flag tells Podman to chown the source to the container's UID.
 * Only applies to bind mounts - named volumes don't need :U.
 */
export const withOwnershipFlag = (mount: VolumeMount): VolumeMount =>
  // Only apply to bind mounts that don't already have ownership flag
  !isBindMount(mount.source) || hasOwnershipFlag(mount.options)
    ? mount
    : {
        ...mount,
        options: mount.options ? `${mount.options},U` : "U",
      };

export const relabelVolumes = (
  volumes: readonly VolumeMount[] | undefined,
  selinuxEnforcing: boolean
): readonly VolumeMount[] | undefined =>
  pipe(
    Option.fromNullable(volumes),
    Option.map((v) => v.map((vol) => withSELinuxRelabel(vol, selinuxEnforcing))),
    Option.getOrUndefined
  );

export interface VolumeProcessingOptions {
  /** Whether SELinux is in enforcing mode */
  selinuxEnforcing: boolean;
  /** Whether to add :U ownership flag for bind mounts */
  applyOwnership: boolean;
}

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
