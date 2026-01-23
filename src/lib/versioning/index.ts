// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Versioning module.
 *
 * Provides branded types for semver versions, smart constructors,
 * and generic version checking utilities.
 *
 * KEY TYPES:
 * - SemVer: Base validated semver string
 * - DivbanBackUpSchemaVersion: Backup metadata format version
 * - DivbanProducerVersion: Tool version that created backup
 * - DivbanConfigSchemaVersion: TOML config schema version
 *
 * KEY FUNCTIONS:
 * - schemaVersion("1.0.0"): Backup schema literal constructor
 * - configSchemaVersion("1.0.0"): Config schema literal constructor
 * - checkVersionInList(): Generic version compatibility check
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types (Opaque - only constructors can create these)
// ─────────────────────────────────────────────────────────────────────────────

export type {
  DivbanBackUpSchemaVersion,
  DivbanConfigSchemaVersion,
  DivbanProducerVersion,
  SemVer,
  SemVerComponents,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Smart Constructors (Runtime validation: string -> Option<T>)
// ─────────────────────────────────────────────────────────────────────────────

export {
  divbanBackUpSchemaVersion,
  divbanConfigSchemaVersion,
  divbanProducerVersion,
  semVer,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Literal Constructors (Compile-time validation: literal -> T)
// ─────────────────────────────────────────────────────────────────────────────

export { configSchemaVersion, producerVersion, schemaVersion } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Pure Functions (Operations on validated types)
// ─────────────────────────────────────────────────────────────────────────────

export {
  compareSemVer,
  compareSemVerComponents,
  formatSemVer,
  isCompatible,
  isComponentsCompatible,
  parseSemVer,
  toComponents,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Effect Schemas (Boundary validation for JSON/config parsing)
// ─────────────────────────────────────────────────────────────────────────────

export {
  DivbanBackUpSchemaVersionSchema,
  DivbanConfigSchemaVersionSchema,
  DivbanProducerVersionSchema,
  SemVerSchema,
} from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// Generic Version Checking (Parameterized utilities)
// ─────────────────────────────────────────────────────────────────────────────

export {
  checkVersionInList,
  formatVersionList,
  mkVersionCheckResult,
  type VersionCheckResult,
} from "./check";
