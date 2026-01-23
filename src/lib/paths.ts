// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Centralized path constants prevent typos and enable global refactoring.
 * All system paths are branded AbsolutePath types for compile-time safety.
 * User home lookups cache results since /etc/passwd rarely changes.
 */

import { readFileSync } from "node:fs";
import { normalize, resolve } from "node:path";
import { Array as Arr, Effect, Option, Schema, pipe } from "effect";
import { ConfigError, ErrorCode, type GeneralError } from "./errors";
import {
  path,
  AbsolutePathSchema,
  type AbsolutePath as AbsolutePathType,
  joinPath,
  pathJoin,
} from "./types";

// ============================================================================
// System Paths (compile-time known valid)
// ============================================================================

export const SYSTEM_PATHS: {
  readonly passwd: AbsolutePathType;
  readonly subuid: AbsolutePathType;
  readonly subgid: AbsolutePathType;
  readonly lingerDir: AbsolutePathType;
  readonly usrSbin: AbsolutePathType;
  readonly sbin: AbsolutePathType;
  readonly nologinPaths: readonly [AbsolutePathType, AbsolutePathType];
  readonly sysctlUnprivilegedPorts: AbsolutePathType;
} = {
  passwd: path("/etc/passwd"),
  subuid: path("/etc/subuid"),
  subgid: path("/etc/subgid"),
  lingerDir: path("/var/lib/systemd/linger"),
  usrSbin: path("/usr/sbin"),
  sbin: path("/sbin"),
  nologinPaths: [path("/usr/sbin/nologin"), path("/sbin/nologin")],
  sysctlUnprivilegedPorts: path("/etc/sysctl.d/50-divban-unprivileged-ports.conf"),
};

// ============================================================================
// User Directory Paths
// ============================================================================

const homeCache = new Map<string, AbsolutePathType>();

export const lookupUserHomeFromPasswd = (
  passwdContent: string,
  username: string
): Option.Option<AbsolutePathType> =>
  pipe(
    passwdContent.split("\n"),
    Arr.findFirst((line) => {
      const fields = line.split(":");
      return pipe(
        Arr.get(fields, 0),
        Option.map((name) => name === username),
        Option.getOrElse(() => false)
      );
    }),
    Option.flatMap((line) => {
      const fields = line.split(":");
      return pipe(
        Arr.get(fields, 5),
        Option.filter((p) => Schema.is(AbsolutePathSchema)(p))
      );
    })
  );

/**
 * Get user's home directory from /etc/passwd.
 * Falls back to /home/<username> if user not found.
 *
 */
export const userHomeDir = (username: string): AbsolutePathType => {
  const cached = homeCache.get(username);
  if (cached !== undefined) {
    return cached;
  }

  const fallback = pathJoin(path("/home"), username);

  let result: AbsolutePathType;
  try {
    const content = readFileSync("/etc/passwd", "utf-8");
    result = pipe(
      lookupUserHomeFromPasswd(content, username),
      Option.getOrElse(() => fallback)
    );
  } catch {
    result = fallback;
  }

  homeCache.set(username, result);
  return result;
};

export const userQuadletDir = (homeDir: AbsolutePathType): AbsolutePathType =>
  pathJoin(homeDir, ".config/containers/systemd");

export const userConfigDir = (homeDir: AbsolutePathType): AbsolutePathType =>
  pathJoin(homeDir, ".config/divban");

export const userDataDir = (homeDir: AbsolutePathType): AbsolutePathType =>
  pathJoin(homeDir, "data");

export const lingerFile = (username: string): AbsolutePathType =>
  pathJoin(SYSTEM_PATHS.lingerDir, username);

// ============================================================================
// Path Conversion Utilities
// ============================================================================

/**
 * Check if a path contains null bytes (injection attack prevention).
 */
const hasNullByte = (p: string): boolean => p.includes("\x00");

/**
 * Normalize and resolve a path to absolute.
 */
const resolveToAbsolute = (p: string): AbsolutePathType => {
  const normalized = normalize(p);
  return (
    normalized.startsWith("/") ? normalized : resolve(process.cwd(), normalized)
  ) as AbsolutePathType;
};

/**
 * Convert a path to absolute with security validation.
 * Rejects null bytes and normalizes path traversal sequences.
 * Use for all user-provided or config-file paths.
 */
export const toAbsolutePathEffect = (p: string): Effect.Effect<AbsolutePathType, ConfigError> =>
  hasNullByte(p)
    ? Effect.fail(
        new ConfigError({
          code: ErrorCode.CONFIG_VALIDATION_ERROR as 12,
          message: `Invalid path contains null byte: ${p}`,
        })
      )
    : Effect.succeed(resolveToAbsolute(p));

/**
 * Convert a path to absolute without Result wrapper.
 * Use ONLY for trusted paths (hardcoded defaults, validated inputs).
 */
export const toAbsolutePathUnsafe = (p: string): AbsolutePathType => resolveToAbsolute(p);

// ============================================================================
// Service Paths
// ============================================================================

export interface ServicePaths {
  dataDir: AbsolutePathType;
  configDir: AbsolutePathType;
  quadletDir: AbsolutePathType;
  homeDir: AbsolutePathType;
}

export const buildServicePaths = (
  homeDir: AbsolutePathType,
  dataDir: AbsolutePathType
): ServicePaths => ({
  dataDir,
  configDir: userConfigDir(homeDir),
  quadletDir: userQuadletDir(homeDir),
  homeDir,
});

// ============================================================================
// File Path Builders
// ============================================================================

export const quadletFilePath = (quadletDir: AbsolutePathType, filename: string): AbsolutePathType =>
  pathJoin(quadletDir, filename);

export const configFilePath = (configDir: AbsolutePathType, filename: string): AbsolutePathType =>
  pathJoin(configDir, filename);

// ============================================================================
// Temporary/Mock Paths (for generate/diff commands)
// ============================================================================

export const TEMP_PATHS: {
  readonly generateDataDir: AbsolutePathType;
  readonly diffDataDir: AbsolutePathType;
  readonly nonexistent: AbsolutePathType;
} = {
  generateDataDir: path("/tmp/divban-generate"),
  diffDataDir: path("/tmp/divban-diff"),
  nonexistent: path("/nonexistent"),
};

export const outputQuadletDir = (
  outputDir: string
): Effect.Effect<AbsolutePathType, GeneralError> => joinPath(outputDir, "quadlets");

export const outputConfigDir = (outputDir: string): Effect.Effect<AbsolutePathType, GeneralError> =>
  joinPath(outputDir, "config");
