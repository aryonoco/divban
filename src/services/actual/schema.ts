// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Actual Budget service configuration schema.
 */

import { Schema } from "effect";
import { absolutePathSchema, containerImageSchema } from "../../config/schema";
import type { SqliteStopBackupConfig } from "../../lib/db-backup";
import { isValidIP } from "../../lib/schema-utils";
import {
  type AbsolutePath,
  type ContainerImage,
  type ContainerName,
  containerImage,
} from "../../lib/types";
import { ContainerNameSchema } from "../../lib/types";

export interface ActualConfig {
  /** Path configuration */
  readonly paths: {
    /** Directory for Actual data (database, user files) */
    readonly dataDir: AbsolutePath;
  };
  /** Container configuration */
  readonly container?:
    | {
        /** Container image */
        readonly image: ContainerImage;
        /** Auto-update policy */
        readonly autoUpdate?: "registry" | "local" | undefined;
      }
    | undefined;
  /** Network configuration */
  readonly network?:
    | {
        /** Host port to bind (default: 5006) */
        readonly port: number;
        /** Host IP to bind (default: 127.0.0.1 for security) */
        readonly host: string;
      }
    | undefined;
  /** Logging level */
  readonly logLevel: "debug" | "info" | "warn" | "error";
  /** Backup configuration - SQLite with container stop (requires --force) */
  readonly backup: SqliteStopBackupConfig;
}

const ACTUAL_CONTAINER = "actual" as ContainerName;

/** Backup configuration input - optional since it has defaults */
export interface ActualBackupConfigInput {
  readonly type?: "sqlite-stop" | undefined;
  readonly container?: string | undefined;
  readonly sqlitePath?: string | undefined;
  readonly includeFiles?: readonly string[] | undefined;
  readonly exclude?: readonly string[] | undefined;
}

const defaultBackupConfig = (): SqliteStopBackupConfig => ({
  type: "sqlite-stop",
  container: ACTUAL_CONTAINER,
  sqlitePath: "server-files/account.sqlite",
  includeFiles: ["user-files/"],
  exclude: [],
});

export const actualBackupConfigSchema: Schema.Schema<
  SqliteStopBackupConfig,
  ActualBackupConfigInput
> = Schema.Struct({
  type: Schema.optionalWith(Schema.Literal("sqlite-stop"), {
    default: (): "sqlite-stop" => "sqlite-stop",
  }),
  container: Schema.optionalWith(ContainerNameSchema, {
    default: (): ContainerName => ACTUAL_CONTAINER,
  }),
  sqlitePath: Schema.optionalWith(Schema.String, {
    default: (): string => "server-files/account.sqlite",
  }),
  includeFiles: Schema.optionalWith(Schema.Array(Schema.String), {
    default: (): readonly string[] => ["user-files/"],
  }),
  exclude: Schema.optionalWith(Schema.Array(Schema.String), {
    default: (): readonly string[] => [],
  }),
});

/** Fields with defaults are optional in input */
export interface ActualConfigInput {
  readonly paths: {
    readonly dataDir: string;
  };
  readonly container?:
    | {
        readonly image?: string | undefined;
        readonly autoUpdate?: "registry" | "local" | undefined;
      }
    | undefined;
  readonly network?:
    | {
        readonly port?: number | undefined;
        readonly host?: string | undefined;
      }
    | undefined;
  readonly logLevel?: "debug" | "info" | "warn" | "error" | undefined;
  readonly backup?: ActualBackupConfigInput | undefined;
}

export const actualConfigSchema: Schema.Schema<ActualConfig, ActualConfigInput> = Schema.Struct({
  paths: Schema.Struct({
    dataDir: absolutePathSchema,
  }),
  container: Schema.optional(
    Schema.Struct({
      image: Schema.optionalWith(containerImageSchema, {
        default: (): ContainerImage =>
          containerImage("docker.io/actualbudget/actual-server:latest"),
      }),
      autoUpdate: Schema.optional(Schema.Literal("registry", "local")),
    })
  ),
  network: Schema.optional(
    Schema.Struct({
      port: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 65535)), {
        default: (): number => 5006,
      }),
      host: Schema.optionalWith(
        Schema.String.pipe(
          Schema.filter(isValidIP, { message: (): string => "Invalid IP address" })
        ),
        { default: (): string => "127.0.0.1" }
      ),
    })
  ),
  logLevel: Schema.optionalWith(Schema.Literal("debug", "info", "warn", "error"), {
    default: (): "info" => "info",
  }),
  backup: Schema.optionalWith(actualBackupConfigSchema, { default: defaultBackupConfig }),
});

interface ActualDefaults {
  readonly container: { readonly image: ContainerImage };
  readonly network: { readonly port: number; readonly host: string };
}

export const actualDefaults: ActualDefaults = {
  container: {
    image: containerImage("docker.io/actualbudget/actual-server:latest"),
  },
  network: {
    port: 5006,
    host: "127.0.0.1",
  },
};
