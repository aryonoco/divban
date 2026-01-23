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
import { absolutePathSchema, containerImageSchema } from "../../config/schema";
import { isValidIP } from "../../lib/schema-utils";
import { type AbsolutePath, type ContainerImage, containerImage } from "../../lib/types";

export interface FreshRssConfig {
  /** Path configuration */
  readonly paths: {
    /** Directory for FreshRSS data (database, config, extensions) */
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
        /** Host port to bind (default: 8080) */
        readonly port: number;
        /** Host IP to bind (default: 127.0.0.1 for security) */
        readonly host: string;
      }
    | undefined;
  /** Timezone (TZ environment variable) */
  readonly timezone: string;
  /** Cron schedule for feed refresh (e.g., "3,33" or every 15 minutes) */
  readonly cronMinutes?: string | undefined;
  /** Trusted proxy CIDR ranges (e.g., "172.16.0.1/12 192.168.0.1/16") */
  readonly trustedProxy?: string | undefined;
  /** Logging level */
  readonly logLevel: "debug" | "info" | "warn" | "error";
}

/** Fields with defaults are optional in input */
export interface FreshRssConfigInput {
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
}

export const freshRssConfigSchema: Schema.Schema<FreshRssConfig, FreshRssConfigInput> =
  Schema.Struct({
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
    logLevel: Schema.optionalWith(Schema.Literal("debug", "info", "warn", "error"), {
      default: (): "info" => "info",
    }),
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
