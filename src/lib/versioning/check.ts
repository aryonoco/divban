// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Generic version checking utilities.
 * Parameterized over version type for reuse across backup and config domains.
 */

import { Array as Arr, Data, Option, pipe } from "effect";
import type { SemVer } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Generic Version Check Result (Parameterized Sum Type)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of checking a version against a supported list.
 * Parameterized over V to preserve type information in pattern matching.
 *
 * This is analogous to Haskell's: data VersionCheck v = Supported | Unsupported v
 */
export type VersionCheckResult<V extends SemVer> = Data.TaggedEnum<{
  versionSupported: object;
  versionUnsupported: { readonly version: V };
}>;

// Factory for creating tagged values (needed per instantiation due to TypeScript limitations)
export const mkVersionCheckResult = <V extends SemVer>(): {
  readonly versionSupported: () => VersionCheckResult<V>;
  readonly versionUnsupported: (args: { readonly version: V }) => VersionCheckResult<V>;
} => Data.taggedEnum<VersionCheckResult<V>>();

// ─────────────────────────────────────────────────────────────────────────────
// Generic Version Checking (Pure Functions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a version is in the supported list.
 *
 * @param version - The version to check (REQUIRED - missing versions caught by Schema)
 * @param supportedVersions - List of supported versions
 * @returns Tagged union indicating support status
 *
 * This is a PURE function - no Effects, no side effects.
 * Domain-specific error handling is done by callers via pattern matching.
 */
export const checkVersionInList = <V extends SemVer>(
  version: V,
  supportedVersions: readonly V[]
): VersionCheckResult<V> => {
  const Check = mkVersionCheckResult<V>();

  return pipe(
    supportedVersions,
    Arr.findFirst((v): boolean => (v as SemVer) === (version as SemVer)),
    Option.match({
      onNone: (): VersionCheckResult<V> => Check.versionUnsupported({ version }),
      onSome: (): VersionCheckResult<V> => Check.versionSupported(),
    })
  );
};

/**
 * Format a list of versions for error messages.
 */
export const formatVersionList = <V extends SemVer>(versions: readonly V[]): string =>
  versions.join(", ");
