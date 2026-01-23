// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Configuration precedence: service-specific > global defaults.
 * Deep merge recursively combines nested objects, with source
 * values taking precedence. Undefined values in source are
 * skipped (don't override target), enabling sparse overrides
 * like { networkMode: "host" } without clobbering other fields.
 */

import { isPlainObject } from "../lib/assert";
import type { ContainerBaseConfig, GlobalConfig } from "./schema";

export const deepMerge = <T extends Record<string, unknown>>(
  target: T,
  source: Partial<NoInfer<T>>
): T => {
  const overrides = Object.fromEntries(
    Object.entries(source)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key, sourceValue]) => {
        const targetValue: unknown = target[key as keyof T];
        if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
          return [key, deepMerge(targetValue, sourceValue)];
        }
        return [key, sourceValue];
      })
  );
  return { ...target, ...overrides } as T;
};

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

export const mergeEnvironment = (
  base: Record<string, string>,
  override: Record<string, string>
): Record<string, string> => {
  return { ...base, ...override };
};

export const addTimezoneToEnv = (
  env: Record<string, string>,
  timezone: string
): Record<string, string> => {
  if (!env["TZ"]) {
    return { ...env, TZ: timezone };
  }
  return env;
};
