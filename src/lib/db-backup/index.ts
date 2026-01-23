// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Database backup/restore module.
 * Provides unified backup strategies for PostgreSQL, SQLite, and FreshRSS.
 */

// Types
export type {
  BackupConfig,
  BackupStrategy,
  BackupStrategyOptions,
  CollectedFiles,
  ContainerLocation,
  DatabaseName,
  DatabaseUser,
  FreshRssCliBackupConfig,
  PostgresBackupConfig,
  RestoreStrategyOptions,
  SqliteStopBackupConfig,
} from "./types";

// Schemas
export {
  BackupConfigSchema,
  ContainerLocationSchema,
  DatabaseNameSchema,
  DatabaseUserSchema,
  FreshRssCliBackupConfigSchema,
  PostgresBackupConfigSchema,
  SqliteStopBackupConfigSchema,
  type ContainerLocationInput,
} from "./schema";

// Workflow (public API)
export { backupService, restoreService, type BackupOptions, type RestoreOptions } from "./workflow";
