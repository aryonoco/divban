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
import type { AbsolutePath } from "./types";
import { unsafeJoinPath, unsafePath } from "./types";

// ============================================================================
// System Paths (compile-time known valid)
// ============================================================================

export const SYSTEM_PATHS: {
  readonly passwd: AbsolutePath;
  readonly subuid: AbsolutePath;
  readonly subgid: AbsolutePath;
  readonly lingerDir: AbsolutePath;
  readonly usrSbin: AbsolutePath;
  readonly sbin: AbsolutePath;
  readonly nologinPaths: readonly [AbsolutePath, AbsolutePath];
  readonly sysctlUnprivilegedPorts: AbsolutePath;
} = {
  passwd: unsafePath("/etc/passwd"),
  subuid: unsafePath("/etc/subuid"),
  subgid: unsafePath("/etc/subgid"),
  lingerDir: unsafePath("/var/lib/systemd/linger"),
  usrSbin: unsafePath("/usr/sbin"),
  sbin: unsafePath("/sbin"),
  nologinPaths: [unsafePath("/usr/sbin/nologin"), unsafePath("/sbin/nologin")],
  sysctlUnprivilegedPorts: unsafePath("/etc/sysctl.d/50-divban-unprivileged-ports.conf"),
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
export const userHomeDir = (username: string): AbsolutePath => {
  try {
    const content = readFileSync("/etc/passwd", "utf-8");

    for (const line of content.split("\n")) {
      const fields = line.split(":");
      // passwd format: username:x:uid:gid:gecos:home:shell
      if (fields[0] === username && fields[5]) {
        return unsafePath(fields[5]);
      }
    }
  } catch {
    // Fall through to default
  }

  // Fallback to /home/<username> if user not found or error reading passwd
  return unsafeJoinPath("/home", username);
};

export const userQuadletDir = (homeDir: AbsolutePath): AbsolutePath =>
  unsafeJoinPath(homeDir, ".config/containers/systemd");

export const userConfigDir = (homeDir: AbsolutePath): AbsolutePath =>
  unsafeJoinPath(homeDir, ".config/divban");

export const userDataDir = (homeDir: AbsolutePath): AbsolutePath => unsafeJoinPath(homeDir, "data");

export const lingerFile = (username: string): AbsolutePath =>
  unsafeJoinPath(SYSTEM_PATHS.lingerDir, username);

// ============================================================================
// Service Paths
// ============================================================================

export interface ServicePaths {
  dataDir: AbsolutePath;
  configDir: AbsolutePath;
  quadletDir: AbsolutePath;
}

export const buildServicePaths = (homeDir: AbsolutePath, dataDir: AbsolutePath): ServicePaths => ({
  dataDir,
  configDir: userConfigDir(homeDir),
  quadletDir: userQuadletDir(homeDir),
});

// ============================================================================
// File Path Builders
// ============================================================================

export const quadletFilePath = (quadletDir: AbsolutePath, filename: string): AbsolutePath =>
  unsafeJoinPath(quadletDir, filename);

export const configFilePath = (configDir: AbsolutePath, filename: string): AbsolutePath =>
  unsafeJoinPath(configDir, filename);

// ============================================================================
// Temporary/Mock Paths (for generate/diff commands)
// ============================================================================

export const TEMP_PATHS: {
  readonly generateDataDir: AbsolutePath;
  readonly diffDataDir: AbsolutePath;
  readonly nonexistent: AbsolutePath;
} = {
  generateDataDir: unsafePath("/tmp/divban-generate"),
  diffDataDir: unsafePath("/tmp/divban-diff"),
  nonexistent: unsafePath("/nonexistent"),
};

export const outputQuadletDir = (outputDir: string): AbsolutePath =>
  unsafeJoinPath(outputDir, "quadlets");

export const outputConfigDir = (outputDir: string): AbsolutePath =>
  unsafeJoinPath(outputDir, "config");
