// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Config definitions for environment-based configuration.
 */

import { Config, ConfigProvider } from "effect";
import { optionalProp } from "../lib/option-helpers";

// ============================================================================
// Type Definitions
// ============================================================================

/** Supported log levels */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Supported log formats */
export type LogFormat = "pretty" | "json";

/**
 * Environment configuration shape.
 */
export interface EnvConfig {
  readonly home: string;
  readonly logging: {
    readonly level: LogLevel;
    readonly format: LogFormat;
  };
  readonly paths: {
    readonly baseDataDir: string;
  };
  readonly debug: boolean;
}

// ============================================================================
// Primitive Configs
// ============================================================================

/**
 * HOME directory from environment.
 * Falls back to /root if not set (common in containerized environments).
 */
export const HomeConfig: Config.Config<string> = Config.string("HOME").pipe(
  Config.withDefault("/root")
);

/**
 * Log level with DIVBAN_ namespace.
 * Uses Config.literal for compile-time type safety on valid values.
 */
export const LogLevelConfig: Config.Config<LogLevel> = Config.nested(
  Config.literal(
    "debug",
    "info",
    "warn",
    "error"
  )("LOG_LEVEL").pipe(Config.withDefault("info" as const)),
  "DIVBAN"
);

/**
 * Log format with DIVBAN_ namespace.
 */
export const LogFormatConfig: Config.Config<LogFormat> = Config.nested(
  Config.literal("pretty", "json")("LOG_FORMAT").pipe(Config.withDefault("pretty" as const)),
  "DIVBAN"
);

/**
 * Base data directory with DIVBAN_ namespace.
 */
export const BaseDataDirConfig: Config.Config<string> = Config.nested(
  Config.string("BASE_DATA_DIR").pipe(Config.withDefault("/srv")),
  "DIVBAN"
);

/**
 * Debug mode flag with DIVBAN_ namespace.
 * When true, forces log level to debug.
 */
export const DebugModeConfig: Config.Config<boolean> = Config.nested(
  Config.boolean("DEBUG").pipe(Config.withDefault(false)),
  "DIVBAN"
);

// ============================================================================
// Composite Config 
// ============================================================================

/**
 * Combined environment configuration.
 *
 * Composed from primitive configs using Config.all and Config.map.
 */
export const EnvConfigSpec: Config.Config<EnvConfig> = Config.all([
  HomeConfig,
  LogLevelConfig,
  LogFormatConfig,
  BaseDataDirConfig,
  DebugModeConfig,
]).pipe(
  Config.map(([home, logLevel, logFormat, baseDataDir, debug]) => ({
    home,
    logging: {
      level: logLevel,
      format: logFormat,
    },
    paths: {
      baseDataDir,
    },
    debug,
  }))
);

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Environment variable names used in testing.
 * These match the actual env vars (HOME, DIVBAN_LOG_LEVEL, etc.)
 */
const envVarNames = {
  home: "HOME",
  logLevel: "DIVBAN_LOG_LEVEL",
  logFormat: "DIVBAN_LOG_FORMAT",
  baseDataDir: "DIVBAN_BASE_DATA_DIR",
  debug: "DIVBAN_DEBUG",
} as const;

/**
 * Test config override options using camelCase keys.
 */
export interface TestConfigOverrides {
  readonly home?: string;
  readonly logLevel?: string;
  readonly logFormat?: string;
  readonly baseDataDir?: string;
  readonly debug?: string;
}

/**
 * Default test configuration values.
 */
const testDefaults = {
  [envVarNames.home]: "/home/testuser",
  [envVarNames.logLevel]: "info",
  [envVarNames.logFormat]: "pretty",
  [envVarNames.baseDataDir]: "/srv",
  [envVarNames.debug]: "false",
} as const satisfies Record<string, string>;

/**
 * Create a ConfigProvider for testing.
 *
 * @example
 * ```typescript
 * const provider = createTestConfigProvider({ logLevel: "debug" });
 * const result = await Effect.runPromise(
 *   Effect.withConfigProvider(EnvConfigSpec, provider)
 * );
 * ```
 */
export const createTestConfigProvider = (
  overrides: TestConfigOverrides = {}
): ConfigProvider.ConfigProvider =>
  ConfigProvider.fromMap(
    new Map(
      Object.entries({
        ...testDefaults,
        ...optionalProp(envVarNames.home, overrides.home),
        ...optionalProp(envVarNames.logLevel, overrides.logLevel),
        ...optionalProp(envVarNames.logFormat, overrides.logFormat),
        ...optionalProp(envVarNames.baseDataDir, overrides.baseDataDir),
        ...optionalProp(envVarNames.debug, overrides.debug),
      })
    )
  );

// ============================================================================
// Config Resolution
// ============================================================================

/**
 * Resolve effective log level from multiple sources.
 *
 * Priority: CLI args > env vars > TOML config
 *
 * @param cliVerbose - CLI --verbose flag
 * @param cliLogLevel - CLI --log-level argument
 * @param envConfig - Environment config from EnvConfigSpec
 * @param tomlLogLevel - Log level from TOML config file
 */
export const resolveLogLevel = (
  cliVerbose: boolean,
  cliLogLevel: LogLevel,
  envConfig: EnvConfig,
  tomlLogLevel: LogLevel
): LogLevel => {
  // CLI --verbose or env DIVBAN_DEBUG=true forces debug
  if (cliVerbose || envConfig.debug) {
    return "debug";
  }
  // CLI --log-level takes precedence if explicitly set (not default)
  if (cliLogLevel !== "info") {
    return cliLogLevel;
  }
  // Env var takes precedence over TOML if explicitly set
  if (envConfig.logging.level !== "info") {
    return envConfig.logging.level;
  }
  // Fall back to TOML config
  return tomlLogLevel;
};

/**
 * Resolve effective log format from multiple sources.
 *
 * Priority: CLI args > env vars > TOML config
 */
export const resolveLogFormat = (
  cliFormat: LogFormat,
  envConfig: EnvConfig,
  tomlFormat: LogFormat
): LogFormat => {
  // CLI --format takes precedence if explicitly set
  if (cliFormat !== "pretty") {
    return cliFormat;
  }
  // Env var takes precedence over TOML if explicitly set
  if (envConfig.logging.format !== "pretty") {
    return envConfig.logging.format;
  }
  // Fall back to TOML config
  return tomlFormat;
};
