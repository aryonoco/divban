// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * FreshRSS service configuration schema.
 */

import { Schema } from "effect";
import { LOG_LEVEL_VALUES } from "../../config/field-values";
import { absolutePathSchema, containerImageSchema } from "../../config/schema";
import type { FreshRssCliBackupConfig } from "../../lib/db-backup";
import { isValidIP } from "../../lib/schema-utils";
import {
  type AbsolutePath,
  type ContainerImage,
  type ContainerName,
  ContainerNameSchema,
  containerImage,
  containerName,
} from "../../lib/types";
import {
  type DivbanConfigSchemaVersion,
  DivbanConfigSchemaVersionSchema,
} from "../../lib/versioning";

const FRESHRSS_CONTAINER = containerName("freshrss");

/** Backup configuration input - optional since it has defaults */
export interface FreshRssBackupConfigInput {
  readonly type?: "freshrss-cli" | undefined;
  readonly container?: string | undefined;
  readonly exclude?: readonly string[] | undefined;
}

const defaultBackupConfig = (): FreshRssCliBackupConfig => ({
  type: "freshrss-cli",
  container: FRESHRSS_CONTAINER,
  exclude: [],
});

export const freshRssBackupConfigSchema: Schema.Schema<
  FreshRssCliBackupConfig,
  FreshRssBackupConfigInput
> = Schema.Struct({
  type: Schema.optionalWith(Schema.Literal("freshrss-cli"), {
    default: (): "freshrss-cli" => "freshrss-cli",
  }),
  container: Schema.optionalWith(ContainerNameSchema, {
    default: (): ContainerName => FRESHRSS_CONTAINER,
  }),
  exclude: Schema.optionalWith(Schema.Array(Schema.String), {
    default: (): readonly string[] => [],
  }),
});

export interface FreshRssConfig {
  readonly divbanConfigSchemaVersion: DivbanConfigSchemaVersion;
  readonly paths: {
    readonly dataDir: AbsolutePath;
  };
  readonly container?:
    | {
        readonly image: ContainerImage;
        readonly autoUpdate?: "registry" | "local" | undefined;
      }
    | undefined;
  readonly network?:
    | {
        readonly port: number;
        readonly host: string;
      }
    | undefined;
  readonly timezone: string;
  /** Cron minute expression (e.g., "3,33" for twice hourly). */
  readonly cronMinutes?: string | undefined;
  /** Space-separated CIDR ranges (e.g., "172.16.0.0/12 192.168.0.0/16"). */
  readonly trustedProxy?: string | undefined;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly backup: FreshRssCliBackupConfig;
}

/** Fields with defaults are optional in input */
export interface FreshRssConfigInput {
  readonly divbanConfigSchemaVersion: string;
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
  readonly timezone?: string | undefined;
  readonly cronMinutes?: string | undefined;
  readonly trustedProxy?: string | undefined;
  readonly logLevel?: "debug" | "info" | "warn" | "error" | undefined;
  readonly backup?: FreshRssBackupConfigInput | undefined;
}

export const freshRssConfigSchema: Schema.Schema<FreshRssConfig, FreshRssConfigInput> =
  Schema.Struct({
    divbanConfigSchemaVersion: DivbanConfigSchemaVersionSchema,
    paths: Schema.Struct({
      dataDir: absolutePathSchema,
    }),
    container: Schema.optional(
      Schema.Struct({
        image: Schema.optionalWith(containerImageSchema, {
          default: (): ContainerImage => containerImage("docker.io/freshrss/freshrss:latest"),
        }),
        autoUpdate: Schema.optional(Schema.Literal("registry", "local")),
      })
    ),
    network: Schema.optional(
      Schema.Struct({
        port: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 65535)), {
          default: (): number => 8080,
        }),
        host: Schema.optionalWith(
          Schema.String.pipe(
            Schema.filter(isValidIP, { message: (): string => "Invalid IP address" })
          ),
          { default: (): string => "127.0.0.1" }
        ),
      })
    ),
    timezone: Schema.optionalWith(Schema.String, {
      default: (): string => "UTC",
    }),
    cronMinutes: Schema.optional(Schema.String),
    trustedProxy: Schema.optional(Schema.String),
    logLevel: Schema.optionalWith(Schema.Literal(...LOG_LEVEL_VALUES), {
      default: (): "info" => "info",
    }),
    backup: Schema.optionalWith(freshRssBackupConfigSchema, { default: defaultBackupConfig }),
  });

interface FreshRssDefaults {
  readonly container: { readonly image: ContainerImage };
  readonly network: { readonly port: number; readonly host: string };
  readonly timezone: string;
}

export const freshRssDefaults: FreshRssDefaults = {
  container: {
    image: containerImage("docker.io/freshrss/freshrss:latest"),
  },
  network: {
    port: 8080,
    host: "127.0.0.1",
  },
  timezone: "UTC",
};
