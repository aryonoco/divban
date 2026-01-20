// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Semantic versioning utilities using Bun.semver.
 * 20x faster than node-semver with full compatibility.
 */

import { semver } from "bun";
import { Option } from "effect";

/**
 * Check if a version satisfies a semver range.
 *
 * @example
 * satisfies("1.2.3", "^1.0.0") // true
 * satisfies("2.0.0", "^1.0.0") // false
 * satisfies("1.0.0", ">=1.0.0 <2.0.0") // true
 */
export const satisfies = (version: string, range: string): boolean => {
  return semver.satisfies(version, range);
};

/**
 * Compare two versions for ordering.
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b.
 *
 * @example
 * compare("1.0.0", "2.0.0") // -1
 * compare("2.0.0", "1.0.0") // 1
 * compare("1.0.0", "1.0.0") // 0
 */
export const compare = (a: string, b: string): -1 | 0 | 1 => {
  return semver.order(a, b);
};

/**
 * Sort an array of versions in ascending order.
 *
 * @example
 * sortVersions(["2.0.0", "1.0.0", "1.5.0"]) // ["1.0.0", "1.5.0", "2.0.0"]
 */
export const sortVersions = (versions: string[]): string[] => {
  return [...versions].sort(semver.order);
};

/**
 * Sort an array of versions in descending order (newest first).
 *
 * @example
 * sortVersionsDesc(["1.0.0", "2.0.0", "1.5.0"]) // ["2.0.0", "1.5.0", "1.0.0"]
 */
export const sortVersionsDesc = (versions: string[]): string[] => {
  return [...versions].sort((a, b) => semver.order(b, a));
};

/**
 * Check if version a is greater than version b.
 */
export const gt = (a: string, b: string): boolean => {
  return semver.order(a, b) === 1;
};

/**
 * Check if version a is greater than or equal to version b.
 */
export const gte = (a: string, b: string): boolean => {
  return semver.order(a, b) >= 0;
};

/**
 * Check if version a is less than version b.
 */
export const lt = (a: string, b: string): boolean => {
  return semver.order(a, b) === -1;
};

/**
 * Check if version a is less than or equal to version b.
 */
export const lte = (a: string, b: string): boolean => {
  return semver.order(a, b) <= 0;
};

/**
 * Check if two versions are equal.
 */
export const eq = (a: string, b: string): boolean => {
  return semver.order(a, b) === 0;
};

/**
 * Check if two versions are not equal.
 */
export const neq = (a: string, b: string): boolean => {
  return semver.order(a, b) !== 0;
};

/**
 * Get the maximum version from an array of versions.
 * Returns None if array is empty.
 *
 * @example
 * maxVersion(["1.0.0", "2.0.0", "1.5.0"]) // Some("2.0.0")
 */
export const maxVersion = (versions: string[]): Option.Option<string> => {
  if (versions.length === 0) {
    return Option.none();
  }
  const sorted = sortVersionsDesc(versions);
  return Option.fromNullable(sorted[0]);
};

/**
 * Get the minimum version from an array of versions.
 * Returns None if array is empty.
 *
 * @example
 * minVersion(["1.0.0", "2.0.0", "1.5.0"]) // Some("1.0.0")
 */
export const minVersion = (versions: string[]): Option.Option<string> => {
  if (versions.length === 0) {
    return Option.none();
  }
  const sorted = sortVersions(versions);
  return Option.fromNullable(sorted[0]);
};

/**
 * Get the maximum version that satisfies a range.
 * Returns None if no version satisfies the range.
 *
 * @example
 * maxSatisfying(["1.0.0", "1.5.0", "2.0.0"], "^1.0.0") // Some("1.5.0")
 */
export const maxSatisfying = (versions: string[], range: string): Option.Option<string> => {
  const matching = versions.filter((v) => semver.satisfies(v, range));
  return maxVersion(matching);
};

/**
 * Get the minimum version that satisfies a range.
 * Returns None if no version satisfies the range.
 *
 * @example
 * minSatisfying(["1.0.0", "1.5.0", "2.0.0"], "^1.0.0") // Some("1.0.0")
 */
export const minSatisfying = (versions: string[], range: string): Option.Option<string> => {
  const matching = versions.filter((v) => semver.satisfies(v, range));
  return minVersion(matching);
};

/**
 * Filter versions that satisfy a range.
 *
 * @example
 * filterSatisfying(["1.0.0", "1.5.0", "2.0.0", "3.0.0"], "^1.0.0 || ^3.0.0")
 * // ["1.0.0", "1.5.0", "3.0.0"]
 */
export const filterSatisfying = (versions: string[], range: string): string[] => {
  return versions.filter((v) => semver.satisfies(v, range));
};

/**
 * Check if a version is valid semver format.
 * Uses satisfies with a wildcard range as a validity check.
 */
export const isValid = (version: string): boolean => {
  // A valid version should satisfy the universal range
  return semver.satisfies(version, "*");
};
