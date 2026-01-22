// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Configuration file loading
 * Supports TOML format with Effect Schema validation.
 * Uses Bun's native TOML parser for optimal performance.
 */

import { Config, Effect, type Schema, pipe } from "effect";
import { ConfigError, ErrorCode, SystemError, errorMessage } from "../lib/errors";
import { toAbsolutePathEffect } from "../lib/paths";
import { decodeToEffect, decodeUnsafe } from "../lib/schema-utils";
import type { AbsolutePath, ServiceName } from "../lib/types";
import { fileExists } from "../system/fs";
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
    const parsed = yield* Effect.try({
      try: (): unknown => Bun.TOML.parse(content),
      catch: (e): ConfigError =>
        new ConfigError({
          code: ErrorCode.CONFIG_PARSE_ERROR as 11,
          message: `Failed to parse TOML in ${filePath}: ${errorMessage(e)}`,
          path: filePath,
          ...(e instanceof Error ? { cause: e } : {}),
        }),
    });

    // Validate with Effect Schema
    return yield* decodeToEffect(schema, parsed, filePath);
  });

/**
 * Load global configuration with explicit HOME directory.
 */
export const loadGlobalConfigWithHome = (
  configPath: AbsolutePath | undefined,
  home: string
): Effect.Effect<GlobalConfig, ConfigError | SystemError> => {
  // tryLoadPath :: String -> Effect GlobalConfig (ConfigError | SystemError)
  const tryLoadPath = (p: string): Effect.Effect<GlobalConfig, ConfigError | SystemError> =>
    pipe(
      toAbsolutePathEffect(p),
      Effect.flatMap((absPath) =>
        pipe(
          fileExists(absPath),
          Effect.flatMap((exists) =>
            exists
              ? loadTomlFile(absPath, globalConfigSchema)
              : Effect.fail(
                  new ConfigError({
                    code: ErrorCode.CONFIG_NOT_FOUND as 10,
                    message: `File not found: ${p}`,
                  })
                )
          )
        )
      )
    );

  // Explicit path: fail on any error
  if (configPath !== undefined) {
    return tryLoadPath(configPath);
  }

  // Default paths: try each, return empty config if all fail
  const defaultPaths: readonly string[] = [
    "/etc/divban/divban.toml",
    `${home}/.config/divban/divban.toml`,
    "./divban.toml",
  ];

  return pipe(
    Effect.firstSuccessOf(defaultPaths.map(tryLoadPath)),
    Effect.orElseSucceed(() => decodeUnsafe(globalConfigSchema, {}) as GlobalConfig)
  );
};

/**
 * Load global configuration from divban.toml.
 * Returns default values if file doesn't exist.
 */
export const loadGlobalConfig = (
  configPath?: AbsolutePath
): Effect.Effect<GlobalConfig, ConfigError | SystemError> =>
  Effect.gen(function* () {
    // Yield the HomeConfig to get the HOME directory
    // Config.withDefault ensures this never fails, so orDie is safe
    const home = yield* Config.string("HOME").pipe(Config.withDefault("/root"), Effect.orDie);
    return yield* loadGlobalConfigWithHome(configPath, home);
  });

/**
 * Load service configuration.
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
  serviceName: ServiceName,
  searchPaths?: readonly string[]
): Effect.Effect<AbsolutePath, ConfigError> => {
  // Default paths array is always non-empty (3 paths)
  const paths: readonly string[] = searchPaths ?? [
    `./divban-${serviceName}.toml`,
    `./${serviceName}/divban-${serviceName}.toml`,
    `/etc/divban/divban-${serviceName}.toml`,
  ];

  // tryPath :: String -> Effect AbsolutePath ConfigError
  const tryPath = (p: string): Effect.Effect<AbsolutePath, ConfigError> =>
    pipe(
      toAbsolutePathEffect(p),
      Effect.flatMap((absPath) =>
        pipe(
          fileExists(absPath),
          Effect.flatMap((exists) =>
            exists
              ? Effect.succeed(absPath)
              : Effect.fail(
                  new ConfigError({
                    code: ErrorCode.CONFIG_NOT_FOUND as 10,
                    message: `Not found: ${p}`,
                  })
                )
          )
        )
      )
    );

  // paths is non-empty (either caller-provided or 3 defaults)
  // Edge case: caller passes empty array
  // This is intentional: empty searchPaths is a programmer error
  return pipe(
    Effect.firstSuccessOf(paths.map(tryPath)),
    // Transform final error to include all searched paths
    Effect.mapError(
      () =>
        new ConfigError({
          code: ErrorCode.CONFIG_NOT_FOUND as 10,
          message: `No configuration found for service '${serviceName}'. Searched: ${paths.join(", ")}`,
        })
    )
  );
};
