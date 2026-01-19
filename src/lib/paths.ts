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
import type { DivbanError } from "./errors";
import type { Result } from "./result";
import {
  path,
  AbsolutePath,
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

/**
 * Get user's home directory from /etc/passwd.
 * Falls back to /home/<username> if user not found.
 *
 * Reads /etc/passwd directly to handle non-standard home directories
 * (e.g., /var/home on Fedora Silverblue/Atomic).
 */
export const userHomeDir = (username: string): AbsolutePathType => {
  try {
    const content = readFileSync("/etc/passwd", "utf-8");

    for (const line of content.split("\n")) {
      const fields = line.split(":");
      // passwd format: username:x:uid:gid:gecos:home:shell
      if (fields[0] === username && fields[5]) {
        // Trust /etc/passwd contains valid absolute paths
        const result = AbsolutePath(fields[5]);
        if (result.ok) {
          return result.value;
        }
        // Fall through to default if passwd has invalid path
      }
    }
  } catch {
    // Fall through to default
  }

  // Fallback to /home/<username> if user not found or error reading passwd
  return pathJoin(path("/home"), username);
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
// Service Paths
// ============================================================================

export interface ServicePaths {
  dataDir: AbsolutePathType;
  configDir: AbsolutePathType;
  quadletDir: AbsolutePathType;
}

export const buildServicePaths = (
  homeDir: AbsolutePathType,
  dataDir: AbsolutePathType
): ServicePaths => ({
  dataDir,
  configDir: userConfigDir(homeDir),
  quadletDir: userQuadletDir(homeDir),
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

export const outputQuadletDir = (outputDir: string): Result<AbsolutePathType, DivbanError> =>
  joinPath(outputDir, "quadlets");

export const outputConfigDir = (outputDir: string): Result<AbsolutePathType, DivbanError> =>
  joinPath(outputDir, "config");
