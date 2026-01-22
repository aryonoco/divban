// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * External library mount handling for Immich.
 */

import { Option } from "effect";
import { mapOr, nonEmpty } from "../../lib/option-helpers";
import type { AbsolutePath } from "../../lib/types";
import type { VolumeMount } from "../../quadlet/types";
import type { ExternalLibrary } from "./schema";

/**
 * Generate library name from index if not provided.
 */
const getLibraryName = (lib: ExternalLibrary, index: number): string =>
  lib.name ?? `external-library-${index + 1}`;

/**
 * Generate mount path for a library.
 */
const getLibraryMountPath = (lib: ExternalLibrary, index: number): string =>
  `/mnt/external/${getLibraryName(lib, index)}`;

/**
 * Convert a single external library to a volume mount.
 */
const libraryToVolumeMount = (lib: ExternalLibrary, index: number): VolumeMount => ({
  source: lib.path,
  target: getLibraryMountPath(lib, index),
  options: lib.readOnly ? "ro" : undefined,
});

/**
 * Convert external libraries to volume mounts.
 */
export const librariesToVolumeMounts = (
  libraries: readonly ExternalLibrary[] | undefined
): VolumeMount[] => mapOr(nonEmpty(libraries), [], (libs) => libs.map(libraryToVolumeMount));

/**
 * Get environment variables for external libraries.
 * Immich uses IMMICH_EXTERNAL_LIBRARY_PATH for library paths.
 */
export const getLibraryEnvironment = (
  libraries: readonly ExternalLibrary[] | undefined
): Record<string, string> => {
  const libs = nonEmpty(libraries);
  if (!Option.isSome(libs)) {
    return {};
  }
  return {
    IMMICH_EXTERNAL_LIBRARY_PATHS: libs.value.map(getLibraryMountPath).join(","),
  };
};

/**
 * Validate external library paths exist.
 * Returns Option of missing paths (None if all exist or empty input).
 */
export const validateLibraryPaths = async (
  libraries: readonly ExternalLibrary[] | undefined
): Promise<Option.Option<readonly AbsolutePath[]>> => {
  const libs = nonEmpty(libraries);
  if (!Option.isSome(libs)) {
    return Option.none();
  }

  const checks = await Promise.all(
    libs.value.map(async (lib) => {
      const exists = await Bun.file(lib.path).exists();
      return exists ? null : lib.path;
    })
  );

  const missing = checks.filter((path): path is AbsolutePath => path !== null);
  return nonEmpty(missing);
};
