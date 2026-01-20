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
import { isValidIP } from "../../lib/schema-utils";

/**
 * Actual Budget configuration (output after decoding).
 * Simple single-container service for personal finance management.
 */
export interface ActualConfig {
  /** Path configuration */
  readonly paths: {
    /** Directory for Actual data (database, user files) */
    readonly dataDir: string;
  };
  /** Container configuration */
  readonly container?:
    | {
        /** Container image */
        readonly image: string;
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
}

/**
 * Actual Budget configuration (input before decoding).
 * Fields with defaults are optional in input.
 */
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
}

export const actualConfigSchema: Schema.Schema<ActualConfig, ActualConfigInput> = Schema.Struct({
  paths: Schema.Struct({
    dataDir: absolutePathSchema,
  }),
  container: Schema.optional(
    Schema.Struct({
      image: Schema.optionalWith(containerImageSchema, {
        default: (): string => "docker.io/actualbudget/actual-server:latest",
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
});

/**
 * Default configuration values.
 */
interface ActualDefaults {
  readonly container: { readonly image: string };
  readonly network: { readonly port: number; readonly host: string };
}

export const actualDefaults: ActualDefaults = {
  container: {
    image: "docker.io/actualbudget/actual-server:latest",
  },
  network: {
    port: 5006,
    host: "127.0.0.1",
  },
};
