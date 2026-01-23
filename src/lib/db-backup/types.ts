// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Database backup/restore types.
 * Supports PostgreSQL, SQLite-Stop, and FreshRSS CLI strategies.
 */

import type { Brand, Effect } from "effect";
import type { BackupError, GeneralError, ServiceError, SystemError } from "../errors";
import type { AbsolutePath, ContainerName, ServiceName, UserId, Username } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Branded Types
// ─────────────────────────────────────────────────────────────────────────────

export type DatabaseName = string & Brand.Brand<"DatabaseName">;
export type DatabaseUser = string & Brand.Brand<"DatabaseUser">;

// ─────────────────────────────────────────────────────────────────────────────
// Container Location - discriminated union for deployment models
// ─────────────────────────────────────────────────────────────────────────────

export type ContainerLocation =
  | { readonly kind: "service" }
  | { readonly kind: "separate"; readonly name: ContainerName };

// ─────────────────────────────────────────────────────────────────────────────
// Backup Configuration - discriminated union by strategy type
// ─────────────────────────────────────────────────────────────────────────────

/** PostgreSQL backup via pg_dumpall (Immich) - hot backup safe */
export interface PostgresBackupConfig {
  readonly type: "postgres";
  readonly container: ContainerLocation;
  readonly database: DatabaseName;
  readonly user: DatabaseUser;
}

/** SQLite backup with container stop (Actual) - requires --force */
export interface SqliteStopBackupConfig {
  readonly type: "sqlite-stop";
  /** Container name to stop/start */
  readonly container: ContainerName;
  /** Relative path to SQLite file within dataDir */
  readonly sqlitePath: string;
  /** Additional files/directories to include (relative paths) */
  readonly includeFiles: readonly string[];
  /** Files/directories to exclude (relative paths) */
  readonly exclude: readonly string[];
}

/** FreshRSS CLI backup - hot backup safe via PHP CLI */
export interface FreshRssCliBackupConfig {
  readonly type: "freshrss-cli";
  /** Container name to exec into */
  readonly container: ContainerName;
  /** Files/directories to exclude from archive */
  readonly exclude: readonly string[];
}

export type BackupConfig = PostgresBackupConfig | SqliteStopBackupConfig | FreshRssCliBackupConfig;

// ─────────────────────────────────────────────────────────────────────────────
// Collected Files Result
// ─────────────────────────────────────────────────────────────────────────────

export interface CollectedFiles {
  readonly files: Readonly<Record<string, string | Uint8Array>>;
  readonly fileList: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface BackupStrategyOptions {
  readonly serviceName: ServiceName;
  readonly dataDir: AbsolutePath;
  readonly user: Username;
  readonly uid: UserId;
  readonly force: boolean;
}

export interface RestoreStrategyOptions {
  readonly serviceName: ServiceName;
  readonly dataDir: AbsolutePath;
  readonly user: Username;
  readonly uid: UserId;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface BackupStrategy<C extends BackupConfig> {
  /** Filename infix for backup archives (e.g., "db", "data") */
  readonly filenameInfix: string;

  /** Compression method */
  readonly compression: "gzip" | "zstd";

  /** Whether this strategy requires --force flag */
  readonly requiresForce: boolean;

  /** Collect data for backup */
  readonly collectData: (
    config: C,
    options: BackupStrategyOptions
  ) => Effect.Effect<CollectedFiles, BackupError | SystemError | GeneralError | ServiceError>;

  /** Restore data from backup */
  readonly restoreData: (
    config: C,
    options: RestoreStrategyOptions
  ) => Effect.Effect<void, BackupError | SystemError | GeneralError | ServiceError>;
}
