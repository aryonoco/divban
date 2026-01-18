// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Actual Budget service configuration schema.
 */

import { z } from "zod";
import { absolutePathSchema, containerImageSchema } from "../../config/schema";

/**
 * Actual Budget configuration.
 * Simple single-container service for personal finance management.
 */
export interface ActualConfig {
  /** Path configuration */
  paths: {
    /** Directory for Actual data (database, user files) */
    dataDir: string;
  };
  /** Container configuration */
  container?:
    | {
        /** Container image */
        image: string;
        /** Auto-update policy */
        autoUpdate?: "registry" | "local" | undefined;
      }
    | undefined;
  /** Network configuration */
  network?:
    | {
        /** Host port to bind (default: 5006) */
        port: number;
        /** Host IP to bind (default: 127.0.0.1 for security) */
        host: string;
      }
    | undefined;
  /** Logging level */
  logLevel: "debug" | "info" | "warn" | "error";
}

export const actualConfigSchema: z.ZodType<ActualConfig> = z.object({
  paths: z.object({
    dataDir: absolutePathSchema,
  }),
  container: z
    .object({
      image: containerImageSchema.default("docker.io/actualbudget/actual-server:latest"),
      autoUpdate: z.enum(["registry", "local"]).optional(),
    })
    .optional(),
  network: z
    .object({
      port: z.number().int().min(1).max(65535).default(5006),
      host: z.string().ip().default("127.0.0.1"),
    })
    .optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
}) as z.ZodType<ActualConfig>;

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
