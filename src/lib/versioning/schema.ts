// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect Schema integration for semver types.
 *
 * Schemas are used at BOUNDARIES (JSON parsing, config loading, CLI args).
 * They convert untrusted string -> branded type using the same validation
 * logic as the smart constructors.
 */

import { Option, Schema } from "effect";
import {
  type DivbanBackUpSchemaVersion,
  type DivbanConfigSchemaVersion,
  type DivbanProducerVersion,
  type SemVer,
  parseSemVer,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Validation Predicate (delegates to canonical parseSemVer)
// ─────────────────────────────────────────────────────────────────────────────

/** Type guard wrapping parseSemVer for Schema.filter compatibility. */
const isValidSemVer = (s: string): s is string => Option.isSome(parseSemVer(s));

// ─────────────────────────────────────────────────────────────────────────────
// Effect Schemas (Boundary Validation)
// ─────────────────────────────────────────────────────────────────────────────

const semVerErrorMsg = (): string =>
  "Must be valid semver: X.Y.Z where X, Y, Z are non-negative integers";

/**
 * Schema for base SemVer type.
 * Validates format and applies brand.
 */
export const SemVerSchema: Schema.Schema<SemVer, string> = Schema.String.pipe(
  Schema.filter(isValidSemVer, { message: semVerErrorMsg }),
  Schema.brand("SemVer")
);

/**
 * Schema for DivbanBackUpSchemaVersion.
 * Used when parsing backup metadata from JSON.
 */
export const DivbanBackUpSchemaVersionSchema: Schema.Schema<DivbanBackUpSchemaVersion, string> =
  Schema.String.pipe(
    Schema.filter(isValidSemVer, { message: semVerErrorMsg }),
    Schema.brand("SemVer"),
    Schema.brand("DivbanBackUpSchemaVersion")
  );

/**
 * Schema for DivbanProducerVersion.
 * Used when parsing backup metadata from JSON.
 */
export const DivbanProducerVersionSchema: Schema.Schema<DivbanProducerVersion, string> =
  Schema.String.pipe(
    Schema.filter(isValidSemVer, { message: semVerErrorMsg }),
    Schema.brand("SemVer"),
    Schema.brand("DivbanProducerVersion")
  );

/**
 * Schema for DivbanConfigSchemaVersion.
 * Used when parsing TOML config files.
 */
export const DivbanConfigSchemaVersionSchema: Schema.Schema<DivbanConfigSchemaVersion, string> =
  Schema.String.pipe(
    Schema.filter(isValidSemVer, { message: semVerErrorMsg }),
    Schema.brand("SemVer"),
    Schema.brand("DivbanConfigSchemaVersion")
  );
