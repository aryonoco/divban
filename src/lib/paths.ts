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
} = {
  passwd: unsafePath("/etc/passwd"),
  subuid: unsafePath("/etc/subuid"),
  subgid: unsafePath("/etc/subgid"),
  lingerDir: unsafePath("/var/lib/systemd/linger"),
  usrSbin: unsafePath("/usr/sbin"),
  sbin: unsafePath("/sbin"),
  nologinPaths: [unsafePath("/usr/sbin/nologin"), unsafePath("/sbin/nologin")],
};

// ============================================================================
// User Directory Paths
// ============================================================================

export const userHomeDir = (username: string): AbsolutePath => unsafeJoinPath("/home", username);

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
