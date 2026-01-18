/**
 * External library mount handling for Immich.
 */

import type { VolumeMount } from "../../quadlet/types";
import type { ExternalLibrary } from "./schema";

/**
 * Convert external libraries to volume mounts.
 */
export const librariesToVolumeMounts = (
  libraries: ExternalLibrary[] | undefined
): VolumeMount[] => {
  if (!libraries || libraries.length === 0) {
    return [];
  }

  return libraries.map((lib, index) => {
    // Use library name or generate one
    const name = lib.name ?? `external-library-${index + 1}`;
    const targetPath = `/mnt/external/${name}`;

    return {
      source: lib.path,
      target: targetPath,
      options: lib.readOnly ? "ro" : undefined,
    };
  });
};

/**
 * Get environment variables for external libraries.
 * Immich uses IMMICH_EXTERNAL_LIBRARY_PATH for library paths.
 */
export const getLibraryEnvironment = (
  libraries: ExternalLibrary[] | undefined
): Record<string, string> => {
  if (!libraries || libraries.length === 0) {
    return {};
  }

  // Create comma-separated list of mount points
  const paths = libraries.map((lib, index) => {
    const name = lib.name ?? `external-library-${index + 1}`;
    return `/mnt/external/${name}`;
  });

  return {
    IMMICH_EXTERNAL_LIBRARY_PATHS: paths.join(","),
  };
};

/**
 * Validate external library paths exist.
 * Returns list of missing paths.
 */
export const validateLibraryPaths = async (
  libraries: ExternalLibrary[] | undefined
): Promise<string[]> => {
  if (!libraries || libraries.length === 0) {
    return [];
  }

  const missing: string[] = [];

  for (const lib of libraries) {
    const file = Bun.file(lib.path);
    if (!(await file.exists())) {
      missing.push(lib.path);
    }
  }

  return missing;
};
