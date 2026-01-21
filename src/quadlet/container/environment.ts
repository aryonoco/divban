// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Container environment configuration for quadlet files.
 */

import { Array as Arr, pipe } from "effect";

import { mergeEnv } from "../../stack/environment";
import type { Entries } from "../entry";
import { concat, fromArray, fromRecord } from "../entry-combinators";
import { escapeIniValue } from "../format";

export interface ContainerEnvironmentConfig {
  /** Environment files to load */
  readonly environmentFiles?: readonly string[] | undefined;
  /** Environment variables */
  readonly environment?: Readonly<Record<string, string>> | undefined;
}

export const getEnvironmentEntries = (config: ContainerEnvironmentConfig): Entries =>
  concat(
    fromArray("EnvironmentFile", config.environmentFiles),
    fromRecord("Environment", config.environment, (k, v) => `${k}=${escapeIniValue(v)}`)
  );

/**
 * Format an environment file reference for quadlet.
 * Supports %h for home directory and other systemd specifiers.
 */
export const formatEnvironmentFile = (path: string): string => {
  // If path starts with home directory pattern, use %h
  if (path.startsWith("/home/")) {
    const parts = path.split("/");
    // /home/username/... -> %h/...
    return `%h/${parts.slice(3).join("/")}`;
  }
  return path;
};

/**
 * Common environment variables.
 */
export const CommonEnvVars: Record<
  string,
  ((...args: never[]) => Record<string, string>) | Record<string, string>
> = {
  /** Timezone */
  TZ: (tz: string): Record<string, string> => ({ TZ: tz }),
  /** User ID */
  PUID: (uid: number): Record<string, string> => ({ PUID: String(uid) }),
  /** Group ID */
  PGID: (gid: number): Record<string, string> => ({ PGID: String(gid) }),
  /** Disable telemetry */
  NO_TELEMETRY: { DO_NOT_TRACK: "1" },
} as const satisfies Record<
  string,
  ((...args: never[]) => Record<string, string>) | Record<string, string>
>;

/**
 * Merge multiple environment configurations.
 * Re-exported from stack/environment for backwards compatibility.
 */
export const mergeEnvironments: (
  ...envs: (Record<string, string | number | boolean | undefined> | undefined)[]
) => Record<string, string> = mergeEnv;

/**
 * Filter environment variables by prefix.
 */
export const filterEnvByPrefix = (
  env: Record<string, string>,
  prefix: string
): Record<string, string> =>
  pipe(
    Object.entries(env),
    Arr.filter(([key]) => key.startsWith(prefix)),
    Object.fromEntries
  );
