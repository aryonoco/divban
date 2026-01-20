// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Centralized path construction utilities.
 * Eliminates scattered `as AbsolutePath` casts throughout the codebase.
 */

import { readFileSync } from "node:fs";
import { normalize, resolve } from "node:path";
import { Effect } from "effect";
import { ConfigError, ErrorCode, GeneralError } from "./errors";
import {
  path,
  AbsolutePath,
  type AbsolutePath as AbsolutePathType,
  type ValidationResult,
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

/**
 * Get user's home directory from /etc/passwd.
 * Falls back to /home/<username> if user not found.
 *
 * Reads /etc/passwd directly to handle non-standard home directories
 * (e.g., /var/home on Fedora Silverblue/Atomic).
 */
export const userHomeDir = (username: string): AbsolutePathType => {
  const cached = homeCache.get(username);
  if (cached) {
    return cached;
  }

  try {
    const content = readFileSync("/etc/passwd", "utf-8");

    for (const line of content.split("\n")) {
      const fields = line.split(":");
      // passwd format: username:x:uid:gid:gecos:home:shell
      if (fields[0] === username && fields[5]) {
        // Trust /etc/passwd contains valid absolute paths
        const result = AbsolutePath(fields[5]);
        if (result.ok) {
          homeCache.set(username, result.value);
          return result.value;
        }
        // Fall through to default if passwd has invalid path
      }
    }
  } catch {
    // Fall through to default
  }

  // Fallback to /home/<username> if user not found or error reading passwd
  const fallback = pathJoin(path("/home"), username);
  homeCache.set(username, fallback);
  return fallback;
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
 * Validate a path contains no null bytes (injection attack prevention).
 */
const validateNoNullBytes = (p: string): ValidationResult<string> =>
  p.includes("\x00")
    ? {
        ok: false,
        error: new GeneralError({
          code: ErrorCode.INVALID_ARGS as 2,
          message: `Invalid path contains null byte: ${p}`,
        }),
      }
    : { ok: true, value: p };

/**
 * Normalize and resolve a path to absolute.
 * Pure transformation function.
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
export const toAbsolutePath = (p: string): ValidationResult<AbsolutePathType> => {
  const validated = validateNoNullBytes(p);
  if (!validated.ok) {
    return validated as ValidationResult<AbsolutePathType>;
  }
  return { ok: true, value: resolveToAbsolute(validated.value) };
};

/**
 * Convert a path to absolute with security validation (Effect version).
 * Rejects null bytes and normalizes path traversal sequences.
 * Use for all user-provided or config-file paths.
 */
export const toAbsolutePathEffect = (p: string): Effect.Effect<AbsolutePathType, ConfigError> =>
  p.includes("\x00")
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

export const outputQuadletDir = (outputDir: string): ValidationResult<AbsolutePathType> =>
  joinPath(outputDir, "quadlets");

export const outputConfigDir = (outputDir: string): ValidationResult<AbsolutePathType> =>
  joinPath(outputDir, "config");
