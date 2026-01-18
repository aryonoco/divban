// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Aryan Ameri <info@ameri.me>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Shared utilities for CLI commands.
 */

import { loadServiceConfig } from "../../config/loader";
import { DivbanError, ErrorCode } from "../../lib/errors";
import { Err, type Result } from "../../lib/result";
import type { AbsolutePath } from "../../lib/types";
import type { Service, ServiceContext } from "../../services/types";
import { fileExists } from "../../system/fs";
import type { ParsedArgs } from "../parser";

/**
 * Extract context options from parsed args.
 */
export const getContextOptions = (args: ParsedArgs): ServiceContext["options"] => ({
  dryRun: args.dryRun,
  verbose: args.verbose,
  force: args.force,
});

/**
 * Common config file locations for a service.
 */
const getConfigPaths = (serviceName: string, homeDir: AbsolutePath): AbsolutePath[] => [
  `${homeDir}/.config/divban/${serviceName}.toml` as AbsolutePath,
  `/etc/divban/${serviceName}.toml` as AbsolutePath,
  `./divban-${serviceName}.toml` as AbsolutePath,
];

/**
 * Find and load a service configuration file.
 * Searches in common locations if no explicit path is provided.
 */
export const resolveServiceConfig = async (
  service: Service,
  homeDir: AbsolutePath,
  explicitPath?: string
): Promise<Result<unknown, DivbanError>> => {
  // If explicit path provided, use it
  if (explicitPath) {
    return loadServiceConfig(explicitPath as AbsolutePath, service.definition.configSchema);
  }

  // Search common locations
  const searchPaths = getConfigPaths(service.definition.name, homeDir);

  for (const path of searchPaths) {
    if (await fileExists(path)) {
      return loadServiceConfig(path, service.definition.configSchema);
    }
  }

  // No config found - this might be OK for some operations
  return Err(
    new DivbanError(
      ErrorCode.CONFIG_NOT_FOUND,
      `No configuration file found for ${service.definition.name}. Searched: ${searchPaths.join(", ")}`
    )
  );
};

/**
 * Format duration for display.
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

/**
 * Format bytes for display.
 */
export const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
};

/**
 * Safely extract dataDir from config.
 * Service configs may have a paths.dataDir property.
 */
export const getDataDirFromConfig = (config: unknown, fallback: AbsolutePath): AbsolutePath => {
  if (
    config !== null &&
    typeof config === "object" &&
    "paths" in config &&
    config.paths !== null &&
    typeof config.paths === "object" &&
    "dataDir" in config.paths &&
    typeof config.paths.dataDir === "string"
  ) {
    return config.paths.dataDir as AbsolutePath;
  }
  return fallback;
};

/**
 * Pad text to a specific display width using Bun.stringWidth().
 * Handles Unicode and emoji correctly (6,756x faster than npm packages).
 */
export const padToWidth = (text: string, width: number): string => {
  const currentWidth = Bun.stringWidth(text);
  return text + " ".repeat(Math.max(0, width - currentWidth));
};

/**
 * Truncate text to a maximum display width using Bun.stringWidth().
 * Handles Unicode and emoji correctly.
 */
export const truncateToWidth = (text: string, maxWidth: number): string => {
  if (Bun.stringWidth(text) <= maxWidth) {
    return text;
  }
  let result = "";
  for (const char of text) {
    if (Bun.stringWidth(result + char) > maxWidth - 1) {
      break;
    }
    result += char;
  }
  return `${result}…`;
};

/**
 * Prompt user for confirmation using console async iterable.
 */
export const confirm = async (prompt: string): Promise<boolean> => {
  console.write(`${prompt} [y/N] `);
  for await (const line of console) {
    const answer = line.toLowerCase().trim();
    return answer === "y" || answer === "yes";
  }
  return false;
};
