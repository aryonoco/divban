/**
 * Version comparison utilities using Bun.semver.
 * Provides semantic versioning operations without external dependencies.
 */

/**
 * Check if a version satisfies a semver range.
 * @example satisfiesVersion("1.2.3", ">=1.0.0") // true
 */
export const satisfiesVersion = (version: string, range: string): boolean => {
  return Bun.semver.satisfies(version, range);
};

/**
 * Compare two versions.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export const compareVersions = (a: string, b: string): -1 | 0 | 1 => {
  return Bun.semver.order(a, b);
};

/**
 * Sort versions in ascending order.
 */
export const sortVersions = (versions: string[]): string[] => {
  return [...versions].sort(Bun.semver.order);
};

/**
 * Sort versions in descending order (newest first).
 */
export const sortVersionsDesc = (versions: string[]): string[] => {
  return [...versions].sort((a, b) => Bun.semver.order(b, a));
};

/**
 * Check if a version is greater than another.
 */
export const isNewerThan = (version: string, other: string): boolean => {
  return Bun.semver.order(version, other) === 1;
};

/**
 * Check if a version is at least a minimum version.
 */
export const isAtLeast = (version: string, minimum: string): boolean => {
  return Bun.semver.order(version, minimum) >= 0;
};
