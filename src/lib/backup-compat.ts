// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Backup-specific compatibility checking.
 * Uses generic utilities from versioning/check.ts.
 */

import { Data, Effect, Match, pipe } from "effect";
import { BackupError, ErrorCode } from "./errors";
import {
  type DivbanBackUpSchemaVersion,
  type DivbanProducerVersion,
  type SemVer,
  compareSemVer,
  schemaVersion,
} from "./versioning";
import { checkVersionInList, formatVersionList } from "./versioning/check";

// ─────────────────────────────────────────────────────────────────────────────
// Backup-Specific Constants
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
export const SUPPORTED_BACKUP_SCHEMA_VERSIONS: readonly DivbanBackUpSchemaVersion[] = [
  schemaVersion("1.0.0"),
] as const;

/**
 * Metadata filename in backup archives.
 * Explicitly named for identification.
 */
export const BACKUP_METADATA_FILENAME = "divban.backup.metadata.json" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Producer Version Check (Backup-Specific - compares versions)
// ─────────────────────────────────────────────────────────────────────────────

export type ProducerCheckResult = Data.TaggedEnum<{
  producerOlderOrEqual: object;
  producerNewer: { readonly version: DivbanProducerVersion };
}>;

const ProducerCheck = Data.taggedEnum<ProducerCheckResult>();

export const checkProducerVersion = (
  backupProducer: DivbanProducerVersion,
  currentProducer: DivbanProducerVersion
): ProducerCheckResult =>
  compareSemVer(backupProducer as SemVer, currentProducer as SemVer) > 0
    ? ProducerCheck.producerNewer({ version: backupProducer })
    : ProducerCheck.producerOlderOrEqual();

// ─────────────────────────────────────────────────────────────────────────────
// Backup Compatibility Validation (Effectful)
// ─────────────────────────────────────────────────────────────────────────────

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
    // Use generic checker
    const schemaResult = checkVersionInList(backupSchema, SUPPORTED_BACKUP_SCHEMA_VERSIONS);

    yield* pipe(
      schemaResult,
      Match.value,
      Match.tag("versionSupported", (): Effect.Effect<void, never> => Effect.void),
      Match.tag(
        "versionUnsupported",
        ({ version }): Effect.Effect<void, BackupError> =>
          Effect.fail(
            new BackupError({
              code: ErrorCode.RESTORE_FAILED as 51,
              message: `Backup schema version ${version} is not supported. Supported versions: ${formatVersionList(SUPPORTED_BACKUP_SCHEMA_VERSIONS)}`,
            })
          )
      ),
      Match.exhaustive
    );

    // Producer version check (backup-specific)
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
