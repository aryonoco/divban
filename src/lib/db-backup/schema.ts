// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Effect Schema definitions for database backup configuration.
 */

import { Schema } from "effect";
import { ContainerNameSchema } from "../types";
import type {
  BackupConfig,
  ContainerLocation,
  DatabaseName,
  DatabaseUser,
  FreshRssCliBackupConfig,
  PostgresBackupConfig,
  SqliteStopBackupConfig,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Branded Type Schemas
// ─────────────────────────────────────────────────────────────────────────────

const databaseNameMsg = (): string => "Database name must be non-empty";
const databaseUserMsg = (): string => "Database user must be non-empty";

export const DatabaseNameSchema: Schema.BrandSchema<DatabaseName, string, never> =
  Schema.String.pipe(
    Schema.nonEmptyString({ message: databaseNameMsg }),
    Schema.brand("DatabaseName")
  );

export const DatabaseUserSchema: Schema.BrandSchema<DatabaseUser, string, never> =
  Schema.String.pipe(
    Schema.nonEmptyString({ message: databaseUserMsg }),
    Schema.brand("DatabaseUser")
  );

// ─────────────────────────────────────────────────────────────────────────────
// Input Types (for Encoded side of schemas)
// ─────────────────────────────────────────────────────────────────────────────

export type ContainerLocationInput =
  | { readonly kind: "service" }
  | { readonly kind: "separate"; readonly name: string };

interface PostgresBackupConfigInput {
  readonly type: "postgres";
  readonly container: ContainerLocationInput;
  readonly database: string;
  readonly user: string;
}

interface SqliteStopBackupConfigInput {
  readonly type: "sqlite-stop";
  readonly container: string;
  readonly sqlitePath: string;
  readonly includeFiles: readonly string[];
  readonly exclude: readonly string[];
}

interface FreshRssCliBackupConfigInput {
  readonly type: "freshrss-cli";
  readonly container: string;
  readonly exclude: readonly string[];
}

type BackupConfigInput =
  | PostgresBackupConfigInput
  | SqliteStopBackupConfigInput
  | FreshRssCliBackupConfigInput;

// ─────────────────────────────────────────────────────────────────────────────
// Container Location Schema
// ─────────────────────────────────────────────────────────────────────────────

export const ContainerLocationSchema: Schema.Schema<ContainerLocation, ContainerLocationInput> =
  Schema.Union(
    Schema.Struct({ kind: Schema.Literal("service") }),
    Schema.Struct({ kind: Schema.Literal("separate"), name: ContainerNameSchema })
  );

// ─────────────────────────────────────────────────────────────────────────────
// Backup Config Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const PostgresBackupConfigSchema: Schema.Schema<
  PostgresBackupConfig,
  PostgresBackupConfigInput
> = Schema.Struct({
  type: Schema.Literal("postgres"),
  container: ContainerLocationSchema,
  database: DatabaseNameSchema,
  user: DatabaseUserSchema,
});

export const SqliteStopBackupConfigSchema: Schema.Schema<
  SqliteStopBackupConfig,
  SqliteStopBackupConfigInput
> = Schema.Struct({
  type: Schema.Literal("sqlite-stop"),
  container: ContainerNameSchema,
  sqlitePath: Schema.String,
  includeFiles: Schema.Array(Schema.String),
  exclude: Schema.Array(Schema.String),
});

export const FreshRssCliBackupConfigSchema: Schema.Schema<
  FreshRssCliBackupConfig,
  FreshRssCliBackupConfigInput
> = Schema.Struct({
  type: Schema.Literal("freshrss-cli"),
  container: ContainerNameSchema,
  exclude: Schema.Array(Schema.String),
});

export const BackupConfigSchema: Schema.Schema<BackupConfig, BackupConfigInput> = Schema.Union(
  PostgresBackupConfigSchema,
  SqliteStopBackupConfigSchema,
  FreshRssCliBackupConfigSchema
);
