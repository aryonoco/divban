// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Backup versioning module.
 *
 * Provides branded types for semver versions, smart constructors,
 * and compatibility checking for backup metadata.
 *
 * KEY TYPES:
 * - SemVer: Base validated semver string
 * - DivbanBackUpSchemaVersion: Metadata format version
 * - DivbanProducerVersion: Tool version that created backup
 *
 * KEY FUNCTIONS:
 * - schemaVersion("1.0.0"): Literal constructor (compile-time safe)
 * - divbanBackUpSchemaVersion(s): Smart constructor (runtime validation)
 * - validateBackupCompatibility(): Effect-ful restore validation
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types (Opaque - only constructors can create these)
// ─────────────────────────────────────────────────────────────────────────────

export type {
  DivbanBackUpSchemaVersion,
  DivbanProducerVersion,
  SemVer,
  SemVerComponents,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Smart Constructors (Runtime validation: string -> Option<T>)
// ─────────────────────────────────────────────────────────────────────────────

export {
  divbanBackUpSchemaVersion,
  divbanProducerVersion,
  semVer,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Literal Constructors (Compile-time validation: literal -> T)
// ─────────────────────────────────────────────────────────────────────────────

export { producerVersion, schemaVersion } from "./types";

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
  DivbanProducerVersionSchema,
  SemVerSchema,
} from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility (Domain logic for restore validation)
// ─────────────────────────────────────────────────────────────────────────────

export {
  BACKUP_METADATA_FILENAME,
  CURRENT_BACKUP_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  checkProducerVersion,
  checkSchemaVersion,
  validateBackupCompatibility,
  type ProducerCheckResult,
  type SchemaCheckResult,
} from "./compat";
