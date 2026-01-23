// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Thin wrapper around Bun.semver with Effect Option integration. */

import { semver } from "bun";
import { Option, pipe } from "effect";

export const satisfies = (version: string, range: string): boolean => {
  return semver.satisfies(version, range);
};

/** Returns -1 if a < b, 0 if a === b, 1 if a > b. */
export const compare = (a: string, b: string): -1 | 0 | 1 => {
  return semver.order(a, b);
};

export const sortVersions = (versions: string[]): string[] => {
  return [...versions].sort(semver.order);
};

export const sortVersionsDesc = (versions: string[]): string[] => {
  return [...versions].sort((a, b) => semver.order(b, a));
};

export const gt = (a: string, b: string): boolean => {
  return semver.order(a, b) === 1;
};

export const gte = (a: string, b: string): boolean => {
  return semver.order(a, b) >= 0;
};

export const lt = (a: string, b: string): boolean => {
  return semver.order(a, b) === -1;
};

export const lte = (a: string, b: string): boolean => {
  return semver.order(a, b) <= 0;
};

export const eq = (a: string, b: string): boolean => {
  return semver.order(a, b) === 0;
};

export const neq = (a: string, b: string): boolean => {
  return semver.order(a, b) !== 0;
};

export const maxVersion = (versions: string[]): Option.Option<string> =>
  pipe(
    Option.some(versions),
    Option.filter((v) => v.length > 0),
    Option.map(sortVersionsDesc),
    Option.flatMap((sorted) => Option.fromNullable(sorted[0]))
  );

export const minVersion = (versions: string[]): Option.Option<string> =>
  pipe(
    Option.some(versions),
    Option.filter((v) => v.length > 0),
    Option.map(sortVersions),
    Option.flatMap((sorted) => Option.fromNullable(sorted[0]))
  );

export const maxSatisfying = (versions: string[], range: string): Option.Option<string> => {
  const matching = versions.filter((v) => semver.satisfies(v, range));
  return maxVersion(matching);
};

export const minSatisfying = (versions: string[], range: string): Option.Option<string> => {
  const matching = versions.filter((v) => semver.satisfies(v, range));
  return minVersion(matching);
};

export const filterSatisfying = (versions: string[], range: string): string[] => {
  return versions.filter((v) => semver.satisfies(v, range));
};

export const isValid = (version: string): boolean => semver.satisfies(version, "*");
