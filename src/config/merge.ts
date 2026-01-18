// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Configuration merging utilities.
 * Merges global defaults with service-specific configuration.
 */

import type { ContainerBaseConfig, GlobalConfig } from "./schema";

/**
 * Deep merge two objects, with source values taking precedence.
 * Arrays are replaced, not merged.
 */
export const deepMerge = <T extends Record<string, unknown>>(
  target: T,
  source: Partial<NoInfer<T>>
): T => {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (sourceValue === undefined) {
      continue;
    }

    if (
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      // Recursively merge objects
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else {
      // Replace value (including arrays)
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
};

/**
 * Merge global config defaults into container configuration.
 */
export const mergeContainerDefaults = (
  global: GlobalConfig,
  container: Partial<ContainerBaseConfig>
): Partial<ContainerBaseConfig> => {
  const defaults = global.defaults;

  return {
    networkMode: container.networkMode ?? defaults?.networkMode ?? "pasta",
    autoUpdate: container.autoUpdate ?? defaults?.autoUpdate ?? "registry",
    ...container,
  };
};

/**
 * Get effective user allocation settings from global config.
 */
export const getUserAllocationSettings = (
  global: GlobalConfig
): {
  uidRangeStart: number;
  uidRangeEnd: number;
  subuidRangeStart: number;
  subuidRangeSize: number;
} => {
  const users = global.users;
  return {
    uidRangeStart: users?.uidRangeStart ?? 10000,
    uidRangeEnd: users?.uidRangeEnd ?? 59999,
    subuidRangeStart: users?.subuidRangeStart ?? 100000,
    subuidRangeSize: users?.subuidRangeSize ?? 65536,
  };
};

/**
 * Get effective logging settings from global config.
 */
export const getLoggingSettings = (
  global: GlobalConfig
): {
  level: "debug" | "info" | "warn" | "error";
  format: "pretty" | "json";
} => {
  const logging = global.logging;
  return {
    level: logging?.level ?? "info",
    format: logging?.format ?? "pretty",
  };
};

/**
 * Get effective paths from global config.
 */
export const getPathSettings = (
  global: GlobalConfig
): {
  baseDataDir: string;
} => {
  const paths = global.paths;
  return {
    baseDataDir: paths?.baseDataDir ?? "/srv",
  };
};

/**
 * Merge environment variables, with service-specific taking precedence.
 */
export const mergeEnvironment = (
  base: Record<string, string>,
  override: Record<string, string>
): Record<string, string> => {
  return { ...base, ...override };
};

/**
 * Add timezone to environment if not already set.
 */
export const addTimezoneToEnv = (
  env: Record<string, string>,
  timezone: string
): Record<string, string> => {
  if (!env["TZ"]) {
    return { ...env, TZ: timezone };
  }
  return env;
};
