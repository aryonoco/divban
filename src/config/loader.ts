// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * TOML configuration loading with fail-fast validation. Files are
 * parsed and validated in a single pass - syntax errors and schema
 * violations are reported immediately with file path context. Global
 * config searches multiple paths (/etc, ~/.config, ./), but explicit
 * paths fail on any error to catch typos and permission issues.
 */

import { Config, Effect, Option, type Schema, pipe } from "effect";
import { ConfigError, ErrorCode, SystemError, errorMessage } from "../lib/errors";
import { toAbsolutePathEffect } from "../lib/paths";
import { decodeToEffect, decodeUnsafe } from "../lib/schema-utils";
import type { AbsolutePath, ServiceName } from "../lib/types";
import { divbanConfigSchemaVersion } from "../lib/versioning";
import { fileExists } from "../system/fs";
import { type GlobalConfig, globalConfigSchema } from "./schema";
import { validateConfigCompatibility } from "./version-compat";

export const loadTomlFile = <A, I = A>(
  filePath: AbsolutePath,
  schema: Schema.Schema<A, I, never>
): Effect.Effect<A, ConfigError | SystemError> =>
  Effect.gen(function* () {
    const file = Bun.file(filePath);
    yield* pipe(
      Effect.promise(() => file.exists()),
      Effect.filterOrFail(
        (exists): exists is true => exists === true,
        () =>
          new ConfigError({
            code: ErrorCode.CONFIG_NOT_FOUND,
            message: `Configuration file not found: ${filePath}`,
            path: filePath,
          })
      )
    );

    const content = yield* Effect.tryPromise({
      try: (): Promise<string> => file.text(),
      catch: (e): SystemError =>
        new SystemError({
          code: ErrorCode.FILE_READ_FAILED,
          message: `Failed to read ${filePath}: ${errorMessage(e)}`,
          ...(e instanceof Error ? { cause: e } : {}),
        }),
    });

    const parsed = yield* Effect.try({
      try: (): unknown => Bun.TOML.parse(content),
      catch: (e): ConfigError =>
        new ConfigError({
          code: ErrorCode.CONFIG_PARSE_ERROR,
          message: `Failed to parse TOML in ${filePath}: ${errorMessage(e)}`,
          path: filePath,
          ...(e instanceof Error ? { cause: e } : {}),
        }),
    });

    const decoded = yield* decodeToEffect(schema, parsed, filePath);

    // Validate config schema version if present (all divban configs have this field)
    yield* pipe(
      Option.fromNullable(
        (decoded as { divbanConfigSchemaVersion?: unknown }).divbanConfigSchemaVersion
      ),
      Option.filter((v): v is string => typeof v === "string"),
      Option.flatMap(divbanConfigSchemaVersion),
      Option.match({
        onNone: (): Effect.Effect<void, never> => Effect.void,
        onSome: (version): Effect.Effect<void, ConfigError> =>
          validateConfigCompatibility(version, filePath),
      })
    );

    return decoded;
  });

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
            Effect.if(exists, {
              onTrue: (): Effect.Effect<GlobalConfig, ConfigError | SystemError> =>
                loadTomlFile(absPath, globalConfigSchema),
              onFalse: (): Effect.Effect<GlobalConfig, ConfigError> =>
                Effect.fail(
                  new ConfigError({
                    code: ErrorCode.CONFIG_NOT_FOUND,
                    message: `File not found: ${p}`,
                  })
                ),
            })
          )
        )
      )
    );

  // Default paths: try each, return empty config if all fail
  const defaultPaths: readonly string[] = [
    "/etc/divban/divban.toml",
    `${home}/.config/divban/divban.toml`,
    "./divban.toml",
  ];

  // Explicit path: fail on any error; otherwise try defaults
  return pipe(
    Option.fromNullable(configPath),
    Option.match({
      onNone: (): Effect.Effect<GlobalConfig, ConfigError | SystemError> =>
        pipe(
          Effect.firstSuccessOf(defaultPaths.map(tryLoadPath)),
          Effect.orElseSucceed(() => decodeUnsafe(globalConfigSchema, {}) as GlobalConfig)
        ),
      onSome: (path): Effect.Effect<GlobalConfig, ConfigError | SystemError> => tryLoadPath(path),
    })
  );
};

/** Returns default values if no config file is found. */
export const loadGlobalConfig = (
  configPath?: AbsolutePath
): Effect.Effect<GlobalConfig, ConfigError | SystemError> =>
  Effect.gen(function* () {
    // Config.withDefault ensures this never fails, so orDie is safe
    const home = yield* Config.string("HOME").pipe(Config.withDefault("/root"), Effect.orDie);
    return yield* loadGlobalConfigWithHome(configPath, home);
  });

export const loadServiceConfig = <A, I = A>(
  filePath: AbsolutePath,
  schema: Schema.Schema<A, I, never>
): Effect.Effect<A, ConfigError | SystemError> => loadTomlFile(filePath, schema);

export const findServiceConfig = (
  serviceName: ServiceName,
  searchPaths?: readonly string[]
): Effect.Effect<AbsolutePath, ConfigError> => {
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
            Effect.if(exists, {
              onTrue: (): Effect.Effect<AbsolutePath, never> => Effect.succeed(absPath),
              onFalse: (): Effect.Effect<AbsolutePath, ConfigError> =>
                Effect.fail(
                  new ConfigError({
                    code: ErrorCode.CONFIG_NOT_FOUND,
                    message: `Not found: ${p}`,
                  })
                ),
            })
          )
        )
      )
    );

  return pipe(
    Effect.firstSuccessOf(paths.map(tryPath)),
    // Transform final error to include all searched paths
    Effect.mapError(
      () =>
        new ConfigError({
          code: ErrorCode.CONFIG_NOT_FOUND,
          message: `No configuration found for service '${serviceName}'. Searched: ${paths.join(", ")}`,
        })
    )
  );
};
