// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Backup compatibility checking.
 *
 * Determines whether a backup can be restored by this version of divban.
 * Uses sum types (tagged unions) for exhaustive pattern matching.
 */

import { Array as Arr, Data, Effect, Match, Option, pipe } from "effect";
import { BackupError, ErrorCode } from "../errors";
import {
  type DivbanBackUpSchemaVersion,
  type DivbanProducerVersion,
  type SemVer,
  compareSemVer,
  schemaVersion,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Current backup schema version.
 *
 * WHEN TO INCREMENT:
 * - Major (1.x.x -> 2.0.0): Breaking change - older divban cannot read
 * - Minor (1.0.x -> 1.1.0): New optional field - older divban can still read
 * - Patch (1.0.0 -> 1.0.1): Bug fix in metadata - no structural change
 */
export const CURRENT_BACKUP_SCHEMA_VERSION: DivbanBackUpSchemaVersion = schemaVersion("1.0.0");

/**
 * Schema versions this divban can restore.
 *
 * Add older versions here to maintain backward compatibility.
 * Remove versions to drop support (with migration path).
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly DivbanBackUpSchemaVersion[] = [
  schemaVersion("1.0.0"),
] as const;

/**
 * Metadata filename in backup archives.
 * Explicitly named for identification.
 */
export const BACKUP_METADATA_FILENAME = "divban.backup.metadata.json" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility Result Types (Sum Types for Exhaustive Matching)
// ─────────────────────────────────────────────────────────────────────────────

/** Schema version check result using Effect Data.TaggedEnum for proper discriminant. */
export type SchemaCheckResult = Data.TaggedEnum<{
  schemaSupported: object;
  schemaUnsupported: { readonly version: DivbanBackUpSchemaVersion };
}>;

const SchemaCheck = Data.taggedEnum<SchemaCheckResult>();

/** Producer version check result using Effect Data.TaggedEnum. */
export type ProducerCheckResult = Data.TaggedEnum<{
  producerOlderOrEqual: object;
  producerNewer: { readonly version: DivbanProducerVersion };
}>;

const ProducerCheck = Data.taggedEnum<ProducerCheckResult>();

// ─────────────────────────────────────────────────────────────────────────────
// Pure Check Functions (No Effects)
// ─────────────────────────────────────────────────────────────────────────────

/** Check if backup schema version is in our supported list. */
export const checkSchemaVersion = (backupSchema: DivbanBackUpSchemaVersion): SchemaCheckResult =>
  pipe(
    SUPPORTED_SCHEMA_VERSIONS,
    Arr.findFirst((v): boolean => (v as SemVer) === (backupSchema as SemVer)),
    Option.match({
      onNone: (): SchemaCheckResult => SchemaCheck.schemaUnsupported({ version: backupSchema }),
      onSome: (): SchemaCheckResult => SchemaCheck.schemaSupported(),
    })
  );

/** Check if backup was created by a newer producer. */
export const checkProducerVersion = (
  backupProducer: DivbanProducerVersion,
  currentProducer: DivbanProducerVersion
): ProducerCheckResult =>
  compareSemVer(backupProducer as SemVer, currentProducer as SemVer) > 0
    ? ProducerCheck.producerNewer({ version: backupProducer })
    : ProducerCheck.producerOlderOrEqual();

// ─────────────────────────────────────────────────────────────────────────────
// Effectful Validation (Fails on unsupported, warns on newer producer)
// ─────────────────────────────────────────────────────────────────────────────

const formatSupportedVersions = (): string => SUPPORTED_SCHEMA_VERSIONS.join(", ");

/**
 * Validate backup compatibility for restore.
 *
 * - FAILS if schema version is not supported (hard error)
 * - WARNS if producer version is newer (soft warning, restore continues)
 */
export const validateBackupCompatibility = (
  backupSchema: DivbanBackUpSchemaVersion,
  backupProducer: DivbanProducerVersion,
  currentProducer: DivbanProducerVersion
): Effect.Effect<void, BackupError> =>
  Effect.gen(function* () {
    // Check schema version (hard requirement)
    yield* pipe(
      checkSchemaVersion(backupSchema),
      Match.value,
      Match.tag("schemaSupported", (): Effect.Effect<void, never> => Effect.void),
      Match.tag(
        "schemaUnsupported",
        ({ version }): Effect.Effect<void, BackupError> =>
          Effect.fail(
            new BackupError({
              code: ErrorCode.RESTORE_FAILED as 51,
              message: `Backup schema version ${version} is not supported. Supported versions: ${formatSupportedVersions()}`,
            })
          )
      ),
      Match.exhaustive
    );

    // Check producer version (soft warning)
    yield* pipe(
      checkProducerVersion(backupProducer, currentProducer),
      Match.value,
      Match.tag("producerOlderOrEqual", (): Effect.Effect<void, never> => Effect.void),
      Match.tag(
        "producerNewer",
        ({ version }): Effect.Effect<void, never> =>
          Effect.logWarning(
            `Backup created by divban ${version} (newer than ${currentProducer}). Some features may not be fully restored.`
          )
      ),
      Match.exhaustive
    );
  });
