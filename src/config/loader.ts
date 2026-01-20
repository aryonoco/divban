// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Configuration file loading using Effect for error handling.
 * Supports TOML format with Effect Schema validation.
 * Uses Bun's native TOML parser for optimal performance.
 */

import { Effect, type Schema } from "effect";
import { ConfigError, ErrorCode, SystemError, errorMessage } from "../lib/errors";
import { toAbsolutePathEffect } from "../lib/paths";
import { decodeOrThrow, decodeToEffect } from "../lib/schema-utils";
import type { AbsolutePath } from "../lib/types";
import { type GlobalConfig, globalConfigSchema } from "./schema";

/**
 * Load and parse a TOML file.
 */
export const loadTomlFile = <A, I = A>(
  filePath: AbsolutePath,
  schema: Schema.Schema<A, I, never>
): Effect.Effect<A, ConfigError | SystemError> =>
  Effect.gen(function* () {
    // Check if file exists
    const file = Bun.file(filePath);
    const exists = yield* Effect.promise(() => file.exists());

    if (!exists) {
      return yield* Effect.fail(
        new ConfigError({
          code: ErrorCode.CONFIG_NOT_FOUND as 10,
          message: `Configuration file not found: ${filePath}`,
          path: filePath,
        })
      );
    }

    // Read file content
    const content = yield* Effect.tryPromise({
      try: (): Promise<string> => file.text(),
      catch: (e): SystemError =>
        new SystemError({
          code: ErrorCode.FILE_READ_FAILED as 27,
          message: `Failed to read ${filePath}: ${errorMessage(e)}`,
          ...(e instanceof Error ? { cause: e } : {}),
        }),
    });

    // Parse TOML using Bun's native parser
    let parsed: unknown;
    try {
      parsed = Bun.TOML.parse(content);
    } catch (e) {
      return yield* Effect.fail(
        new ConfigError({
          code: ErrorCode.CONFIG_PARSE_ERROR as 11,
          message: `Failed to parse TOML in ${filePath}: ${errorMessage(e)}`,
          path: filePath,
          ...(e instanceof Error ? { cause: e } : {}),
        })
      );
    }

    // Validate with Effect Schema
    return yield* decodeToEffect(schema, parsed, filePath);
  });

/**
 * Load global configuration from divban.toml.
 * Returns default values if file doesn't exist.
 */
export const loadGlobalConfig = (
  configPath?: AbsolutePath
): Effect.Effect<GlobalConfig, ConfigError | SystemError> =>
  Effect.gen(function* () {
    // Try default paths if not specified
    // Search paths are plain strings (may be relative), converted at boundary
    const paths: string[] = configPath
      ? [configPath]
      : [
          "/etc/divban/divban.toml",
          `${Bun.env["HOME"] ?? "/root"}/.config/divban/divban.toml`,
          "./divban.toml",
        ];

    for (const p of paths) {
      const file = Bun.file(p);
      const exists = yield* Effect.promise(() => file.exists());

      if (exists) {
        const absolutePath = yield* toAbsolutePathEffect(p);
        // Use explicit type assertion due to Effect Schema's input/output type inference
        // with exactOptionalPropertyTypes. The schema has defaults on all
        // nested objects, so the output type always has defined properties.
        return (yield* loadTomlFile(absolutePath, globalConfigSchema)) as GlobalConfig;
      }
    }

    // Return defaults if no config file found
    return decodeOrThrow(globalConfigSchema, {}) as GlobalConfig;
  });

/**
 * Load service-specific configuration.
 */
export const loadServiceConfig = <A, I = A>(
  filePath: AbsolutePath,
  schema: Schema.Schema<A, I, never>
): Effect.Effect<A, ConfigError | SystemError> => loadTomlFile(filePath, schema);

/**
 * Find service config file using common patterns.
 * Search paths are plain strings (may be relative).
 * Returns AbsolutePath once found.
 */
export const findServiceConfig = (
  serviceName: string,
  searchPaths?: string[]
): Effect.Effect<AbsolutePath, ConfigError> =>
  Effect.gen(function* () {
    const defaultPaths: string[] = [
      `./divban-${serviceName}.toml`,
      `./${serviceName}/divban-${serviceName}.toml`,
      `/etc/divban/divban-${serviceName}.toml`,
    ];

    const paths = searchPaths ?? defaultPaths;

    for (const p of paths) {
      const file = Bun.file(p);
      const exists = yield* Effect.promise(() => file.exists());

      if (exists) {
        return yield* toAbsolutePathEffect(p);
      }
    }

    return yield* Effect.fail(
      new ConfigError({
        code: ErrorCode.CONFIG_NOT_FOUND as 10,
        message: `No configuration found for service '${serviceName}'. Searched: ${paths.join(", ")}`,
      })
    );
  });
